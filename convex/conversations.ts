import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { conversationMinutes } from "./insights";
import { deleteItem } from "./items";
import { requireOwned, requireUser } from "./lib/auth";
import { personScores } from "./lib/personScores";
import {
  activityType as activityTypeValidator,
  energy as energyValidator,
  itemKind,
  relationship as relationshipValidator,
  topicMix as topicMixValidator,
} from "./schema";

const MAX_ITEMS_PER_CONVERSATION = 5;
const MAX_FACTS_PER_PERSON = 12;
const MAX_SUB_IDEAS = 6;
const DAY = 24 * 60 * 60 * 1000;
const MAX_PROFILE_LIST = 8;
const MAX_TOPIC_LABELS = 8;
const RECENT_CONVERSATIONS = 500;

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

export async function insertConversation(ctx: MutationCtx, ownerId: Id<"users">, startedAt: number, place?: string) {
  return await ctx.db.insert("conversations", {
    ownerId,
    startedAt,
    status: "listening",
    participantIds: [],
    place,
    gist: [],
    leftOutCount: 0,
    pendingChunks: 0,
    topicIds: [],
  });
}

export async function closeConversation(ctx: MutationCtx, conversation: Doc<"conversations">, endedAt: number) {
  await ctx.db.patch("conversations", conversation._id, {
    endedAt,
    status: (conversation.pendingChunks ?? 0) > 0 ? "processing" : "done",
  });
}

export const start = mutation({
  args: { place: v.optional(v.string()) },
  handler: async (ctx, { place }) => {
    const ownerId = await requireUser(ctx);
    return await insertConversation(ctx, ownerId, Date.now(), place);
  },
});

export const stop = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ownerId = await requireUser(ctx);
    const conversation = await requireOwned(ctx, "conversations", conversationId, ownerId);
    if (conversation.status !== "listening") return null;
    await closeConversation(ctx, conversation, Date.now());
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

export async function contextFor(ctx: QueryCtx, ownerId: Id<"users">, conversation: Doc<"conversations"> | null) {
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
  const items =
    conversation === null
      ? []
      : await ctx.db
          .query("items")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
          .take(20);
  return {
    people: people.map((p) => ({
      name: p.name,
      archetype: p.archetype ?? null,
      relationship: p.relationship ?? null,
      roleLabel: p.roleLabel ?? null,
    })),
    participants: people.filter((p) => conversation?.participantIds.includes(p._id)).map((p) => p.name),
    topics: topics.map((t) => t.label),
    gist: conversation?.gist ?? [],
    summaryLine: conversation?.summaryLine ?? null,
    items: items.map((i) => ({ kind: i.kind, text: i.text })),
  };
}

export const extractionContext = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null) return null;
    return await contextFor(ctx, conversation.ownerId, conversation);
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

export function nearDuplicate(a: string, b: string) {
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

export async function findOrCreatePerson(
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

const nullableString = v.union(v.string(), v.null());

export const extractionValidator = v.object({
  place: nullableString,
  gist: v.array(v.string()),
  leftOutCount: v.number(),
  mood: v.union(v.number(), v.null()),
  moodReason: nullableString,
  energy: v.union(energyValidator, v.null()),
  activityType: v.union(activityTypeValidator, v.null()),
  topicMix: v.union(topicMixValidator, v.null()),
  summaryLine: nullableString,
  people: v.array(
    v.object({
      name: v.string(),
      archetype: nullableString,
      facts: v.array(v.string()),
      relationship: v.union(relationshipValidator, v.null()),
      roleLabel: nullableString,
      from: nullableString,
      workingOn: nullableString,
      birthday: nullableString,
      howWeMet: nullableString,
      interests: v.array(v.string()),
      whatMatters: v.array(v.string()),
      family: v.array(v.string()),
      lifeEvents: v.array(v.string()),
      giftIdeas: v.array(v.string()),
      relationshipSummary: nullableString,
      signal: v.union(v.object({ fun: v.number(), overlap: v.number(), depth: v.number() }), v.null()),
    }),
  ),
  topics: v.array(v.object({ label: v.string(), subIdeas: v.array(v.string()) })),
  items: v.array(
    v.object({
      kind: itemKind,
      text: v.string(),
      personName: nullableString,
      topicLabel: nullableString,
      dueAt: v.union(v.number(), v.null()),
      importance: v.number(),
    }),
  ),
});

export type Extraction = typeof extractionValidator.type;
type Sourced = { text: string; conversationIds: Id<"conversations">[] };
type TopicMix = { work: number; personal: number; logistics: number };

const sourced = (text: string, id: Id<"conversations"> | undefined): Sourced => ({ text, conversationIds: id ? [id] : [] });

function cite(fact: Sourced, id: Id<"conversations"> | undefined) {
  return id === undefined || fact.conversationIds.includes(id) ? fact : { ...fact, conversationIds: [...fact.conversationIds, id] };
}

function mergeFact(existing: Sourced | undefined, text: string | null, id: Id<"conversations"> | undefined) {
  if (text === null) return existing;
  if (existing !== undefined && nearDuplicate(existing.text, text)) return cite(existing, id);
  return sourced(text, id);
}

function mergeFacts(existing: Sourced[] | undefined, texts: string[], id: Id<"conversations"> | undefined) {
  const merged = [...(existing ?? [])];
  for (const text of texts) {
    const at = merged.findIndex((f) => nearDuplicate(f.text, text));
    if (at >= 0) merged[at] = cite(merged[at], id);
    else merged.push(sourced(text, id));
  }
  return merged.slice(-MAX_PROFILE_LIST);
}

function blend(previous: number | undefined, next: number | null) {
  if (next === null) return previous;
  if (previous === undefined) return next;
  return Math.round(((previous + next) / 2) * 100) / 100;
}

function blendMix(previous: TopicMix | undefined, next: TopicMix | null) {
  if (next === null) return previous;
  if (previous === undefined) return next;
  return {
    work: (previous.work + next.work) / 2,
    personal: (previous.personal + next.personal) / 2,
    logistics: (previous.logistics + next.logistics) / 2,
  };
}

export async function refreshPeople(ctx: MutationCtx, ownerId: Id<"users">, personIds: Id<"people">[]) {
  if (personIds.length === 0) return;
  const recent = await ctx.db
    .query("conversations")
    .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(RECENT_CONVERSATIONS);
  const labels = new Map<Id<"topics">, string | null>();
  for (const personId of new Set(personIds)) {
    const person = await ctx.db.get("people", personId);
    if (person === null || person.ownerId !== ownerId) continue;
    const theirs = recent.filter((c) => c.participantIds.includes(personId));
    const topicCounts = new Map<Id<"topics">, number>();
    for (const c of theirs) {
      for (const topicId of c.topicIds ?? []) topicCounts.set(topicId, (topicCounts.get(topicId) ?? 0) + 1);
    }
    for (const topicId of topicCounts.keys()) {
      if (!labels.has(topicId)) labels.set(topicId, (await ctx.db.get("topics", topicId))?.label ?? null);
    }
    const topicLabels = [...topicCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .flatMap(([topicId]) => labels.get(topicId) ?? []);
    const items = await ctx.db
      .query("items")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .order("desc")
      .take(100);
    const openPromises = items
      .filter((i): i is typeof i & { kind: "you_owe" | "they_owe" } => i.status === "open" && (i.kind === "you_owe" || i.kind === "they_owe"))
      .slice(0, MAX_PROFILE_LIST)
      .map((i) => ({ text: i.text, direction: i.kind, conversationIds: i.conversationId ? [i.conversationId] : [], itemId: i._id }));
    const scores = personScores(
      theirs.map((c) => ({
        minutes: conversationMinutes(c),
        mood: c.mood,
        topicMix: c.topicMix,
        signal: c.personSignals?.find((p) => p.personId === personId),
      })),
      topicCounts.size,
    );
    await ctx.db.patch("people", personId, {
      totalMinutes: theirs.reduce((sum, c) => sum + conversationMinutes(c), 0),
      lastInteractionAt: theirs.length > 0 ? Math.max(...theirs.map((c) => c.endedAt ?? c.startedAt)) : person.lastInteractionAt,
      encounterCount: theirs.length,
      distinctTopicCount: topicCounts.size,
      topicLabels: topicLabels.slice(0, MAX_TOPIC_LABELS),
      openPromises,
      ...scores,
    });
  }
}

export async function applyNotes(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  conversation: Doc<"conversations"> | null,
  extraction: Extraction,
) {
  const conversationId = conversation?._id;
  const now = Date.now();

  const people = await ctx.db
    .query("people")
    .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(200);
  const participantIds = [...(conversation?.participantIds ?? [])];
  const personIdByName = new Map<string, Id<"people">>();
  const personSignals = [...(conversation?.personSignals ?? [])];
  for (const heard of extraction.people) {
    const person = await findOrCreatePerson(ctx, ownerId, people, heard.name, now);
    personIdByName.set(normalize(heard.name), person._id);
    const facts = [...person.facts];
    for (const fact of heard.facts) {
      if (!facts.some((f) => nearDuplicate(f, fact))) facts.push(fact);
    }
    const joined = conversation !== null && !participantIds.includes(person._id);
    if (joined) participantIds.push(person._id);
    const gapDays = person.conversationCount > 0 ? (now - person.lastSeenAt) / DAY : null;
    const cadenceDays =
      joined && gapDays !== null && gapDays >= 0.5
        ? Math.round(person.cadenceDays ? person.cadenceDays * 0.7 + gapDays * 0.3 : gapDays)
        : person.cadenceDays;
    if (heard.signal !== null && conversation !== null) {
      const at = personSignals.findIndex((p) => p.personId === person._id);
      const previous = at >= 0 ? personSignals[at] : { personId: person._id, fun: 0, overlap: 0, depth: 0 };
      const merged = {
        personId: person._id,
        fun: Math.max(previous.fun, heard.signal.fun),
        overlap: Math.max(previous.overlap, heard.signal.overlap),
        depth: Math.max(previous.depth, heard.signal.depth),
      };
      if (at >= 0) personSignals[at] = merged;
      else personSignals.push(merged);
    }
    await ctx.db.patch("people", person._id, {
      facts: facts.slice(-MAX_FACTS_PER_PERSON),
      archetype: person.archetype ?? heard.archetype ?? undefined,
      lastSeenAt: now,
      conversationCount: person.conversationCount + (joined ? 1 : 0),
      cadenceDays,
      relationship: person.relationship ?? heard.relationship ?? undefined,
      roleLabel: person.roleLabel || heard.roleLabel || undefined,
      from: mergeFact(person.from, heard.from, conversationId),
      workingOn: mergeFact(person.workingOn, heard.workingOn, conversationId),
      birthday: mergeFact(person.birthday, heard.birthday, conversationId),
      howWeMet: mergeFact(person.howWeMet, heard.howWeMet, conversationId),
      interests: mergeFacts(person.interests, heard.interests, conversationId),
      whatMatters: mergeFacts(person.whatMatters, heard.whatMatters, conversationId),
      family: mergeFacts(person.family, heard.family, conversationId),
      lifeEvents: mergeFacts(person.lifeEvents, heard.lifeEvents, conversationId),
      giftIdeas: mergeFacts(person.giftIdeas, heard.giftIdeas, conversationId),
      relationshipSummary: heard.relationshipSummary ?? person.relationshipSummary,
    });
  }

  const topics = await ctx.db
    .query("topics")
    .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(100);
  const topicIds = [...(conversation?.topicIds ?? [])];
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

  const existing =
    conversationId === undefined
      ? []
      : await ctx.db
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
  const inserted: { itemId: Id<"items">; plan: boolean; personId?: Id<"people"> }[] = [];
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
    inserted.push({ itemId, plan: item.dueAt !== null || item.kind === "you_owe", personId });
  }

  if (conversation !== null) {
    const gist = [...conversation.gist];
    for (const line of extraction.gist) {
      if (!gist.some((g) => normalize(g) === normalize(line))) gist.push(line);
    }
    await ctx.db.patch("conversations", conversation._id, {
      participantIds,
      topicIds,
      place: conversation.place ?? extraction.place ?? undefined,
      gist: gist.slice(0, 3),
      leftOutCount: conversation.leftOutCount + extraction.leftOutCount + dropped,
      mood: blend(conversation.mood, extraction.mood),
      moodReason: extraction.moodReason ?? conversation.moodReason,
      energy: extraction.energy ?? conversation.energy,
      activityType: extraction.activityType ?? conversation.activityType,
      topicMix: blendMix(conversation.topicMix, extraction.topicMix),
      summaryLine: extraction.summaryLine ?? conversation.summaryLine,
      personSignals,
    });
    await finishChunk(ctx, (await ctx.db.get("conversations", conversation._id))!);
  }

  await refreshPeople(ctx, ownerId, [
    ...participantIds,
    ...personIdByName.values(),
    ...inserted.flatMap((i) => (i.personId ? [i.personId] : [])),
  ]);
  return { planIds: inserted.filter((i) => i.plan).map((i) => i.itemId), inserted: inserted.length };
}

export const applyExtraction = internalMutation({
  args: { conversationId: v.id("conversations"), extraction: extractionValidator },
  handler: async (ctx, { conversationId, extraction }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null) return [];
    const { planIds } = await applyNotes(ctx, conversation.ownerId, conversation, extraction);
    return planIds;
  },
});
