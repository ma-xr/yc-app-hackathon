import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { deleteItem } from "./items";
import { requireOwned, requireUser } from "./lib/auth";
import { itemKind } from "./schema";

const MAX_ITEMS_PER_CONVERSATION = 5;
const MAX_FACTS_PER_PERSON = 12;
const MAX_SUB_IDEAS = 6;
const DAY = 24 * 60 * 60 * 1000;

async function withDetails(ctx: QueryCtx, conversation: Doc<"conversations">) {
  const people = await Promise.all(conversation.participantIds.map((id) => ctx.db.get("people", id)));
  const items = await ctx.db
    .query("items")
    .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
    .take(20);
  return { ...conversation, people: people.filter((p) => p !== null), items };
}

export const today = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const ownerId = await requireUser(ctx);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId).gte("startedAt", since))
      .order("desc")
      .take(50);
    return await Promise.all(conversations.map((c) => withDetails(ctx, c)));
  },
});

export const range = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const ownerId = await requireUser(ctx);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) =>
        q.eq("ownerId", ownerId).gte("startedAt", from).lt("startedAt", to),
      )
      .order("asc")
      .take(200);
    return await Promise.all(conversations.map((c) => withDetails(ctx, c)));
  },
});

export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ownerId = await requireUser(ctx);
    const conversation = await requireOwned(ctx, "conversations", conversationId, ownerId);
    return await withDetails(ctx, conversation);
  },
});

export const start = mutation({
  args: { place: v.optional(v.string()) },
  handler: async (ctx, { place }) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db.insert("conversations", {
      ownerId,
      startedAt: Date.now(),
      status: "listening",
      participantIds: [],
      place,
      gist: [],
      leftOutCount: 0,
      pendingChunks: 0,
      topicIds: [],
    });
  },
});

export const stop = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ownerId = await requireUser(ctx);
    const conversation = await requireOwned(ctx, "conversations", conversationId, ownerId);
    if (conversation.status !== "listening") return null;
    await ctx.db.patch("conversations", conversationId, {
      endedAt: Date.now(),
      status: (conversation.pendingChunks ?? 0) > 0 ? "processing" : "done",
    });
    return null;
  },
});

export const remove = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ownerId = await requireUser(ctx);
    await requireOwned(ctx, "conversations", conversationId, ownerId);
    const items = await ctx.db
      .query("items")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .take(100);
    for (const item of items) {
      await deleteItem(ctx, item._id);
    }
    await ctx.db.delete("conversations", conversationId);
    return null;
  },
});

export const beginChunk = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ownerId = await requireUser(ctx);
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null || conversation.ownerId !== ownerId || conversation.status === "done") return false;
    await ctx.db.patch("conversations", conversationId, {
      pendingChunks: (conversation.pendingChunks ?? 0) + 1,
    });
    return true;
  },
});

export const extractionContext = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null) return null;
    const ownerId = conversation.ownerId;
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(100);
    const topics = await ctx.db
      .query("topics")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(30);
    const items = await ctx.db
      .query("items")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .take(20);
    return {
      people: people.map((p) => ({ name: p.name, archetype: p.archetype ?? null })),
      participants: people.filter((p) => conversation.participantIds.includes(p._id)).map((p) => p.name),
      topics: topics.map((t) => t.label),
      gist: conversation.gist,
      items: items.map((i) => ({ kind: i.kind, text: i.text })),
    };
  },
});

async function finishChunk(ctx: MutationCtx, conversation: Doc<"conversations">) {
  const pendingChunks = Math.max(0, (conversation.pendingChunks ?? 1) - 1);
  await ctx.db.patch("conversations", conversation._id, {
    pendingChunks,
    ...(conversation.status === "processing" && pendingChunks === 0 ? { status: "done" as const } : {}),
  });
}

export const chunkFailed = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation !== null) await finishChunk(ctx, conversation);
    return null;
  },
});

function normalize(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
}

function nearDuplicate(a: string, b: string) {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const wx = new Set(x.split(" "));
  const wy = new Set(y.split(" "));
  const shared = [...wx].filter((w) => wy.has(w)).length;
  return shared / Math.max(wx.size, wy.size) >= 0.7;
}

function matchPerson(people: Doc<"people">[], name: string) {
  const heard = normalize(name);
  const exact = people.find((p) => normalize(p.name) === heard);
  if (exact) return exact;
  const [first, ...rest] = heard.split(" ");
  const candidates = people.filter((p) => {
    const [pFirst, ...pRest] = normalize(p.name).split(" ");
    return pFirst === first && (rest.length === 0 || pRest.length === 0);
  });
  return candidates.length === 1 ? candidates[0] : undefined;
}

async function findOrCreatePerson(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  people: Doc<"people">[],
  name: string,
  now: number,
) {
  const existing = matchPerson(people, name);
  if (existing) return existing;
  const id = await ctx.db.insert("people", {
    ownerId,
    name: name.trim(),
    facts: [],
    lastSeenAt: now,
    conversationCount: 0,
  });
  const created = (await ctx.db.get("people", id))!;
  people.push(created);
  return created;
}

export const applyExtraction = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    extraction: v.object({
      place: v.union(v.string(), v.null()),
      gist: v.array(v.string()),
      leftOutCount: v.number(),
      people: v.array(
        v.object({
          name: v.string(),
          archetype: v.union(v.string(), v.null()),
          facts: v.array(v.string()),
        }),
      ),
      topics: v.array(v.object({ label: v.string(), subIdeas: v.array(v.string()) })),
      items: v.array(
        v.object({
          kind: itemKind,
          text: v.string(),
          personName: v.union(v.string(), v.null()),
          topicLabel: v.union(v.string(), v.null()),
          dueAt: v.union(v.number(), v.null()),
          importance: v.number(),
        }),
      ),
    }),
  },
  handler: async (ctx, { conversationId, extraction }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null) return [];
    const ownerId = conversation.ownerId;
    const now = Date.now();

    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(200);
    const participantIds = [...conversation.participantIds];
    const personIdByName = new Map<string, Id<"people">>();
    for (const heard of extraction.people) {
      const person = await findOrCreatePerson(ctx, ownerId, people, heard.name, now);
      personIdByName.set(normalize(heard.name), person._id);
      const facts = [...person.facts];
      for (const fact of heard.facts) {
        if (!facts.some((f) => nearDuplicate(f, fact))) facts.push(fact);
      }
      const joined = !participantIds.includes(person._id);
      if (joined) participantIds.push(person._id);
      const gapDays = person.conversationCount > 0 ? (now - person.lastSeenAt) / DAY : null;
      const cadenceDays =
        joined && gapDays !== null && gapDays >= 0.5
          ? Math.round(person.cadenceDays ? person.cadenceDays * 0.7 + gapDays * 0.3 : gapDays)
          : person.cadenceDays;
      await ctx.db.patch("people", person._id, {
        facts: facts.slice(-MAX_FACTS_PER_PERSON),
        archetype: person.archetype ?? heard.archetype ?? undefined,
        lastSeenAt: now,
        conversationCount: person.conversationCount + (joined ? 1 : 0),
        cadenceDays,
      });
    }

    const topics = await ctx.db
      .query("topics")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(100);
    const topicIds = [...(conversation.topicIds ?? [])];
    const topicIdByLabel = new Map<string, Id<"topics">>();
    for (const heard of extraction.topics) {
      let topic = topics.find((t) => normalize(t.label) === normalize(heard.label));
      if (!topic) {
        const id = await ctx.db.insert("topics", {
          ownerId,
          label: heard.label.trim(),
          subIdeas: [],
          conversationCount: 0,
          peopleCount: 0,
          lastSeenAt: now,
        });
        topic = (await ctx.db.get("topics", id))!;
        topics.push(topic);
      }
      topicIdByLabel.set(normalize(heard.label), topic._id);
      const subIdeas = [...topic.subIdeas];
      for (const idea of heard.subIdeas) {
        if (!subIdeas.some((s) => normalize(s) === normalize(idea))) subIdeas.push(idea);
      }
      const linked = !topicIds.includes(topic._id);
      if (linked) topicIds.push(topic._id);
      await ctx.db.patch("topics", topic._id, {
        subIdeas: subIdeas.slice(-MAX_SUB_IDEAS),
        conversationCount: topic.conversationCount + (linked ? 1 : 0),
        peopleCount: topic.peopleCount + (linked ? Math.max(1, participantIds.length) : 0),
        lastSeenAt: now,
      });
    }

    const existing = await ctx.db
      .query("items")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .take(20);
    const seen = new Set(existing.map((i) => normalize(i.text)));
    const room = Math.max(0, MAX_ITEMS_PER_CONVERSATION - existing.length);
    const resolvePerson = (name: string | null) =>
      name === null ? undefined : (personIdByName.get(normalize(name)) ?? matchPerson(people, name)?._id);
    const openByPerson = new Map<Id<"people">, string[]>();
    for (const personId of new Set(extraction.items.map((i) => resolvePerson(i.personName)))) {
      if (personId === undefined) continue;
      const open = await ctx.db
        .query("items")
        .withIndex("by_personId", (q) => q.eq("personId", personId))
        .order("desc")
        .take(100);
      openByPerson.set(
        personId,
        open.filter((i) => i.status === "open").map((i) => i.text),
      );
    }
    const fresh = extraction.items
      .filter((i) => !seen.has(normalize(i.text)))
      .filter((i) => {
        const personId = resolvePerson(i.personName);
        return personId === undefined || !(openByPerson.get(personId) ?? []).some((t) => nearDuplicate(t, i.text));
      })
      .sort((a, b) => b.importance - a.importance)
      .slice(0, room);
    const dropped = extraction.items.length - fresh.length;
    const inserted: { itemId: Id<"items">; plan: boolean }[] = [];
    for (const item of fresh) {
      const personId = resolvePerson(item.personName);
      const itemId = await ctx.db.insert("items", {
        ownerId,
        conversationId,
        personId,
        topicId: item.topicLabel === null ? undefined : topicIdByLabel.get(normalize(item.topicLabel)),
        kind: item.kind,
        text: item.text,
        dueAt: item.dueAt ?? undefined,
        importance: item.importance,
        status: "open",
        editedByUser: false,
      });
      inserted.push({ itemId, plan: item.dueAt !== null || item.kind === "you_owe" });
    }

    const gist = [...conversation.gist];
    for (const line of extraction.gist) {
      if (!gist.some((g) => normalize(g) === normalize(line))) gist.push(line);
    }

    await ctx.db.patch("conversations", conversationId, {
      participantIds,
      topicIds,
      place: conversation.place ?? extraction.place ?? undefined,
      gist: gist.slice(0, 3),
      leftOutCount: conversation.leftOutCount + extraction.leftOutCount + dropped,
    });
    const updated = (await ctx.db.get("conversations", conversationId))!;
    await finishChunk(ctx, updated);
    return inserted.filter((i) => i.plan).map((i) => i.itemId);
  },
});
