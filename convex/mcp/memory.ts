import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";

const MAX_NOTE_WORDS = 12;

const KIND_LABELS: Record<string, string> = {
  you_owe: "you owe",
  they_owe: "they owe you",
  plan: "plan",
  urgent: "urgent",
  fact: "fact",
  question: "open question",
  takeaway: "takeaway",
};

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());

async function peopleNames(ctx: QueryCtx, ownerId: Id<"users">) {
  const people = await ctx.db
    .query("people")
    .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
    .take(300);
  return { people, names: new Map<Id<"people">, string>(people.map((p) => [p._id, p.name])) };
}

function itemView(item: Doc<"items">, names: Map<Id<"people">, string>) {
  return {
    id: item._id,
    kind: KIND_LABELS[item.kind] ?? item.kind,
    note: item.text,
    person: item.personId ? (names.get(item.personId) ?? null) : null,
    due: iso(item.dueAt),
    importance: item.importance,
    status: item.status,
    editedByYou: item.editedByUser,
  };
}

function conversationView(c: Doc<"conversations">, names: Map<Id<"people">, string>) {
  return {
    id: c._id,
    startedAt: iso(c.startedAt),
    endedAt: iso(c.endedAt),
    people: c.participantIds.map((id) => names.get(id) ?? "someone"),
    place: c.place ?? null,
    gist: c.gist,
    smallTalkLeftOut: c.leftOutCount,
  };
}

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

function score(queryWords: string[], fields: string[]) {
  const haystack = new Set(fields.flatMap(words));
  const joined = fields.join(" ").toLowerCase();
  let hits = 0;
  for (const w of queryWords) {
    if (haystack.has(w)) hits += 2;
    else if (joined.includes(w)) hits += 1;
  }
  return hits;
}

async function openItems(ctx: QueryCtx, ownerId: Id<"users">) {
  return await ctx.db
    .query("items")
    .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "open"))
    .take(300);
}

const byImportanceThenDue = (a: Doc<"items">, b: Doc<"items">) =>
  b.importance - a.importance || (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);

export const searchMemory = internalQuery({
  args: { ownerId: v.id("users"), query: v.string(), limit: v.number() },
  handler: async (ctx, { ownerId, query, limit }) => {
    const queryWords = words(query);
    if (queryWords.length === 0) throw new ConvexError("Query needs at least one word");
    const { people, names } = await peopleNames(ctx, ownerId);
    const items = await ctx.db
      .query("items")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(500);
    const topics = await ctx.db
      .query("topics")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(100);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(200);
    const hits: { type: string; score: number; result: unknown }[] = [];
    for (const item of items) {
      if (item.status === "dismissed") continue;
      const person = item.personId ? (names.get(item.personId) ?? "") : "";
      const s = score(queryWords, [item.text, person, KIND_LABELS[item.kind] ?? item.kind]);
      if (s > 0) hits.push({ type: "item", score: s + item.importance / 10, result: itemView(item, names) });
    }
    for (const p of people) {
      const s = score(queryWords, [p.name, p.archetype ?? "", ...p.facts]);
      if (s > 0)
        hits.push({
          type: "person",
          score: s,
          result: { id: p._id, name: p.name, archetype: p.archetype ?? null, facts: p.facts, lastSeenAt: iso(p.lastSeenAt) },
        });
    }
    for (const t of topics) {
      const s = score(queryWords, [t.label, ...t.subIdeas]);
      if (s > 0)
        hits.push({
          type: "topic",
          score: s,
          result: { label: t.label, subIdeas: t.subIdeas, conversationCount: t.conversationCount, peopleCount: t.peopleCount },
        });
    }
    for (const c of conversations) {
      const people = c.participantIds.map((id) => names.get(id) ?? "");
      const s = score(queryWords, [...c.gist, ...people, c.place ?? ""]);
      if (s > 0) hits.push({ type: "conversation", score: s, result: conversationView(c, names) });
    }
    hits.sort((a, b) => b.score - a.score);
    return {
      query,
      matches: hits.slice(0, limit).map((h) => ({ type: h.type, ...(h.result as object) })),
      totalMatches: hits.length,
    };
  },
});

export const openPromises = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const { names } = await peopleNames(ctx, ownerId);
    const items = (await openItems(ctx, ownerId))
      .filter((i) => i.kind === "you_owe" || i.kind === "they_owe" || i.kind === "plan" || i.kind === "urgent")
      .sort(byImportanceThenDue)
      .map((i) => itemView(i, names));
    return {
      youOwe: items.filter((i) => i.kind === "you owe" || i.kind === "urgent"),
      theyOweYou: items.filter((i) => i.kind === "they owe you"),
      plans: items.filter((i) => i.kind === "plan"),
    };
  },
});

export const followups = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const { names } = await peopleNames(ctx, ownerId);
    const suggested = await ctx.db
      .query("followups")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "suggested"))
      .take(100);
    const scheduled = await ctx.db
      .query("followups")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "scheduled"))
      .take(100);
    const rows = [];
    for (const f of [...suggested, ...scheduled].sort((a, b) => a.sendAt - b.sendAt)) {
      const item = f.itemId ? await ctx.db.get(f.itemId) : null;
      if (item !== null && item.status !== "open") continue;
      rows.push({
        id: f._id,
        person: names.get(f.personId) ?? "someone",
        why: f.reason,
        sendAt: iso(f.sendAt),
        status: f.status,
        relatedNote: item?.text ?? null,
        draftTexts: f.drafts,
      });
    }
    return { followups: rows };
  },
});

export const person = internalQuery({
  args: { ownerId: v.id("users"), name: v.string() },
  handler: async (ctx, { ownerId, name }) => {
    const { people, names } = await peopleNames(ctx, ownerId);
    const wanted = name.trim().toLowerCase();
    const match =
      people.find((p) => p.name.toLowerCase() === wanted) ??
      people.find((p) => p.name.toLowerCase().split(/\s+/).includes(wanted)) ??
      people.find((p) => p.name.toLowerCase().includes(wanted));
    if (match === undefined) {
      return { found: false, knownPeople: people.map((p) => p.name).slice(0, 50) };
    }
    const items = await ctx.db
      .query("items")
      .withIndex("by_personId", (q) => q.eq("personId", match._id))
      .order("desc")
      .take(100);
    const recent = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(300);
    return {
      found: true,
      person: {
        id: match._id,
        name: match.name,
        archetype: match.archetype ?? null,
        facts: match.facts,
        lastSeenAt: iso(match.lastSeenAt),
        conversationCount: match.conversationCount,
        usuallyTalkEveryDays: match.cadenceDays ?? null,
      },
      openNotes: items.filter((i) => i.status === "open").map((i) => itemView(i, names)),
      recentConversations: recent
        .filter((c) => c.participantIds.includes(match._id))
        .slice(0, 10)
        .map((c) => conversationView(c, names)),
    };
  },
});

export const recentConversations = internalQuery({
  args: { ownerId: v.id("users"), days: v.number(), since: v.number() },
  handler: async (ctx, { ownerId, days, since }) => {
    const { names } = await peopleNames(ctx, ownerId);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId).gte("startedAt", since))
      .order("desc")
      .take(100);
    return { days, conversations: conversations.map((c) => conversationView(c, names)) };
  },
});

export const goalsAndConcerns = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const { names } = await peopleNames(ctx, ownerId);
    const items = (await openItems(ctx, ownerId)).sort(byImportanceThenDue);
    const topics = await ctx.db
      .query("topics")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(20);
    const reflections = await ctx.db
      .query("reflections")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(7);
    return {
      goals: {
        recurringTopics: topics.map((t) => ({
          label: t.label,
          subIdeas: t.subIdeas,
          conversationCount: t.conversationCount,
          peopleCount: t.peopleCount,
          lastSeenAt: iso(t.lastSeenAt),
        })),
        statedGoals: items.filter((i) => (i.kind as string) === "goal").map((i) => itemView(i, names)),
        plans: items.filter((i) => i.kind === "plan").map((i) => itemView(i, names)),
        takeaways: items.filter((i) => i.kind === "takeaway").map((i) => itemView(i, names)),
      },
      concerns: {
        statedConcerns: items.filter((i) => (i.kind as string) === "concern").map((i) => itemView(i, names)),
        urgent: items.filter((i) => i.kind === "urgent").map((i) => itemView(i, names)),
        openQuestions: items.filter((i) => i.kind === "question").map((i) => itemView(i, names)),
        highImportancePromises: items
          .filter((i) => i.kind === "you_owe" && i.importance >= 4)
          .map((i) => itemView(i, names)),
      },
      eveningCheckInQuestions: reflections.map((r) => ({ date: r.date, question: r.question })),
    };
  },
});

export const addNote = internalMutation({
  args: { ownerId: v.id("users"), text: v.string(), person: v.string() },
  handler: async (ctx, { ownerId, text, person }) => {
    const note = text.trim().replace(/\s+/g, " ");
    if (!note) throw new ConvexError("Note is empty");
    if (note.split(" ").length > MAX_NOTE_WORDS) throw new ConvexError(`Keep notes to ${MAX_NOTE_WORDS} words or fewer`);
    const wanted = person.trim().toLowerCase();
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(300);
    const match = people.find((p) => p.name.toLowerCase() === wanted) ?? people.find((p) => p.name.toLowerCase().includes(wanted));
    if (match === undefined) {
      throw new ConvexError(`Jesse doesn't know "${person}". Known people: ${people.map((p) => p.name).slice(0, 30).join(", ")}`);
    }
    if (!match.facts.some((f) => f.toLowerCase() === note.toLowerCase())) {
      await ctx.db.patch(match._id, { facts: [...match.facts, note] });
    }
    return { saved: true, person: match.name, facts: [...new Set([...match.facts, note])] };
  },
});
