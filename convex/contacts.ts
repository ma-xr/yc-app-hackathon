import { paginationOptsValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireOwned, requireUser } from "./lib/auth";
import { MIN_HISTORY_MINUTES } from "./lib/contactStats";
import { upsertContacts } from "./lib/contactSync";
import { contactSource, profileFactKind } from "./schema";

const DAY = 24 * 60 * 60 * 1000;
const FOCUS_WINDOW_DAYS = 30;
const FOCUS_LIMIT = 5;

const KIND_ORDER: Infer<typeof profileFactKind>[] = [
  "relationship",
  "how_met",
  "working_on",
  "matters",
  "life_event",
  "family",
  "from",
  "place",
  "interest",
  "food",
  "style",
  "gift_idea",
  "avoid",
];

const SORT_INDEX = {
  recent: "by_ownerId_and_lastInteractionAt",
  time: "by_ownerId_and_totalMinutes",
  deepest: "by_ownerId_and_depthScore",
  encounters: "by_ownerId_and_encounterCount",
  fun: "by_ownerId_and_funScore",
  compatible: "by_ownerId_and_compatibilityScore",
  deepTalk: "by_ownerId_and_deepTalkScore",
} as const;

const sortKey = v.union(
  v.literal("recent"),
  v.literal("time"),
  v.literal("deepest"),
  v.literal("encounters"),
  v.literal("fun"),
  v.literal("compatible"),
  v.literal("deepTalk"),
);

function latestFact(person: Doc<"people">, kind: Infer<typeof profileFactKind>) {
  let best: { text: string; learnedAt: number } | null = null;
  for (const fact of person.profile ?? []) {
    if (fact.kind === kind && (best === null || fact.learnedAt >= best.learnedAt)) best = fact;
  }
  return best?.text ?? null;
}

async function photoUrl(ctx: QueryCtx, person: Doc<"people">) {
  return person.photoStorageId ? await ctx.storage.getUrl(person.photoStorageId) : null;
}

export function birthdayInfo(birthday: Doc<"people">["birthday"], now: number) {
  if (!birthday) return { age: null, nextBirthdayInDays: null };
  const today = new Date(now);
  const y = today.getUTCFullYear();
  const todayUtc = Date.UTC(y, today.getUTCMonth(), today.getUTCDate());
  const thisYear = Date.UTC(y, birthday.month - 1, birthday.day);
  const next = thisYear >= todayUtc ? thisYear : Date.UTC(y + 1, birthday.month - 1, birthday.day);
  const age = birthday.year === undefined ? null : y - birthday.year - (thisYear <= todayUtc ? 0 : 1);
  return { age, nextBirthdayInDays: Math.round((next - todayUtc) / DAY) };
}

export const list = query({
  args: { sort: sortKey },
  handler: async (ctx, { sort }) => {
    const ownerId = await requireUser(ctx);
    const people = await ctx.db
      .query("people")
      .withIndex(SORT_INDEX[sort], (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(300);
    return await Promise.all(
      people.map(async (p) => ({
        _id: p._id,
        name: p.name,
        avatarKey: p.avatarKey,
        photoUrl: await photoUrl(ctx, p),
        headline: latestFact(p, "working_on") ?? p.archetype ?? null,
        relationship: latestFact(p, "relationship"),
        lastInteractionAt: p.lastInteractionAt,
        totalMinutes: p.totalMinutes ?? 0,
        encounterCount: p.encounterCount ?? 0,
        depthScore: p.depthScore ?? 0,
        funScore: p.funScore ?? 0,
        compatibilityScore: p.compatibilityScore ?? 0,
        deepTalkScore: p.deepTalkScore ?? 0,
      })),
    );
  },
});

type FocusEntry = { score: number; reasons: { weight: number; text: string }[]; talksThisWeek: number };

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const now = Date.now();
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(2000);
    const synced = people.filter((p) => p.lastSyncedAt !== undefined);
    const newest = synced.reduce<Doc<"people"> | null>(
      (best, p) => (best === null || p.lastSyncedAt! > best.lastSyncedAt! ? p : best),
      null,
    );

    const candidates = new Map<Id<"people">, FocusEntry>();
    const entry = (id: Id<"people">) => {
      const existing = candidates.get(id);
      if (existing) return existing;
      const created: FocusEntry = { score: 0, reasons: [], talksThisWeek: 0 };
      candidates.set(id, created);
      return created;
    };

    const interactions = await ctx.db
      .query("interactions")
      .withIndex("by_ownerId_and_startedAt", (q) =>
        q.eq("ownerId", ownerId).gte("startedAt", now - FOCUS_WINDOW_DAYS * DAY),
      )
      .order("desc")
      .take(500);
    for (const i of interactions) {
      const ageDays = Math.max(0, (now - i.startedAt) / DAY);
      const e = entry(i.personId);
      e.score += Math.min(i.minutes, 180) * i.depth * Math.exp(-ageDays / 10);
      if (ageDays <= 7) e.talksThisWeek += 1;
    }

    const open = await ctx.db
      .query("items")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "open"))
      .order("desc")
      .take(300);
    for (const item of open) {
      if (item.personId === undefined) continue;
      if (item.kind === "you_owe") {
        const e = entry(item.personId);
        e.score += 150;
        e.reasons.push({ weight: 2, text: `You owe: ${item.text}` });
      } else if (item.kind === "they_owe") {
        const e = entry(item.personId);
        e.score += 60;
        e.reasons.push({ weight: 1, text: `Waiting on: ${item.text}` });
      }
    }

    for (const p of people) {
      const days = birthdayInfo(p.birthday, now).nextBirthdayInDays;
      if (days === null || days > 7) continue;
      const e = entry(p._id);
      e.score += 200 - days * 10;
      e.reasons.push({
        weight: 3,
        text: days === 0 ? "Birthday today" : days === 1 ? "Birthday tomorrow" : `Birthday in ${days} days`,
      });
    }

    const byId = new Map(people.map((p) => [p._id, p]));
    const ranked = [...candidates.entries()]
      .filter(([id, e]) => byId.has(id) && e.score > 0)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, FOCUS_LIMIT);
    const focus = await Promise.all(
      ranked.map(async ([id, e]) => {
        const person = byId.get(id)!;
        const top = [...e.reasons].sort((a, b) => b.weight - a.weight)[0];
        const talks =
          e.talksThisWeek > 1 ? `${e.talksThisWeek} talks this week` : e.talksThisWeek === 1 ? "Talked this week" : "Talked recently";
        return {
          _id: id,
          name: person.name,
          avatarKey: person.avatarKey,
          photoUrl: await photoUrl(ctx, person),
          reason: top?.text ?? talks,
        };
      }),
    );

    return {
      total: synced.length,
      source: newest?.source ?? null,
      lastSyncedAt: newest?.lastSyncedAt ?? null,
      focus,
    };
  },
});

type FactSource = { conversationId: Id<"conversations">; title: string; startedAt: number };

export const get = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const ownerId = await requireUser(ctx);
    const person = await requireOwned(ctx, "people", personId, ownerId);

    const sources = new Map<Id<"conversations">, FactSource | null>();
    const resolveSource = async (conversationId: Id<"conversations">) => {
      const cached = sources.get(conversationId);
      if (cached !== undefined) return cached;
      const conversation = await ctx.db.get("conversations", conversationId);
      let source: FactSource | null = null;
      if (conversation !== null && conversation.ownerId === ownerId) {
        const interactions = await ctx.db
          .query("interactions")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
          .take(20);
        const mine = interactions.find((i) => i.personId === personId);
        source = {
          conversationId,
          title: mine?.title ?? conversation.gist[0] ?? "A conversation",
          startedAt: conversation.startedAt,
        };
      }
      sources.set(conversationId, source);
      return source;
    };

    const ordered = [...(person.profile ?? [])].sort(
      (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.learnedAt - a.learnedAt,
    );
    const facts = [];
    for (const fact of ordered) {
      facts.push({
        kind: fact.kind,
        text: fact.text,
        learnedAt: fact.learnedAt,
        source: fact.conversationId ? await resolveSource(fact.conversationId) : null,
      });
    }

    const items = await ctx.db
      .query("items")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .order("desc")
      .take(200);
    const open = items.filter((i) => i.status === "open" && i.ownerId === ownerId);
    const promise = (i: Doc<"items">) => ({ _id: i._id, text: i.text, dueAt: i.dueAt });

    return {
      person: { ...person, photoUrl: await photoUrl(ctx, person) },
      ...birthdayInfo(person.birthday, Date.now()),
      facts,
      promises: {
        youOwe: open.filter((i) => i.kind === "you_owe").map(promise),
        theyOwe: open.filter((i) => i.kind === "they_owe").map(promise),
      },
    };
  },
});

export const history = query({
  args: { personId: v.id("people"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { personId, paginationOpts }) => {
    const ownerId = await requireUser(ctx);
    await requireOwned(ctx, "people", personId, ownerId);
    return await ctx.db
      .query("interactions")
      .withIndex("by_personId_and_startedAt", (q) => q.eq("personId", personId))
      .order("desc")
      .filter((q) => q.gte(q.field("minutes"), MIN_HISTORY_MINUTES))
      .paginate(paginationOpts);
  },
});

export const sync = mutation({
  args: {
    source: contactSource,
    contacts: v.array(
      v.object({
        contactId: v.string(),
        name: v.string(),
        phones: v.array(v.string()),
        emails: v.array(v.string()),
        birthday: v.optional(v.object({ month: v.number(), day: v.number(), year: v.optional(v.number()) })),
        photoStorageId: v.optional(v.id("_storage")),
        avatarKey: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { source, contacts }) => {
    const ownerId = await requireUser(ctx);
    const { added, updated, total } = await upsertContacts(ctx, ownerId, source, contacts);
    return { added, updated, total };
  },
});

export const generatePhotoUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});
