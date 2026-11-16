import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireOwned, requireUser } from "./lib/auth";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const LIFTS_AFTER_DAYS = 5;
const BASELINE_AFTER_DAYS = 7;
const MAX_EVIDENCE = 50;
const DEFAULT_MINUTES = 10;
const REFRESH_THROTTLE_MS = 2 * MINUTE;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(date: string) {
  if (!datePattern.test(date)) throw new ConvexError("Dates look like YYYY-MM-DD");
}

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function conversationMinutes(c: Doc<"conversations">) {
  return c.endedAt === undefined ? DEFAULT_MINUTES : Math.max(1, Math.round((c.endedAt - c.startedAt) / MINUTE));
}

export async function moment(ctx: QueryCtx, c: Doc<"conversations">) {
  const [people, topics] = await Promise.all([
    Promise.all(c.participantIds.map((id) => ctx.db.get("people", id))),
    Promise.all((c.topicIds ?? []).map((id) => ctx.db.get("topics", id))),
  ]);
  return {
    _id: c._id,
    startedAt: c.startedAt,
    endedAt: c.endedAt ?? null,
    minutes: conversationMinutes(c),
    place: c.placeName ?? c.place ?? null,
    channel: c.channel ?? "voice",
    people: people.filter((p) => p !== null).map((p) => ({ _id: p._id, name: p.name, roleLabel: p.roleLabel ?? null })),
    topics: topics.filter((t) => t !== null).map((t) => t.label),
    gist: c.gist,
    mood: c.mood ?? null,
    moodReason: c.moodReason ?? null,
    energy: c.energy ?? null,
    activityType: c.activityType ?? null,
    summaryLine: c.summaryLine ?? null,
  };
}

async function personBrief(ctx: QueryCtx, personId: Id<"people">) {
  const p = await ctx.db.get("people", personId);
  if (p === null) return null;
  return {
    _id: p._id,
    name: p.name,
    roleLabel: p.roleLabel ?? null,
    relationship: p.relationship ?? null,
    lastInteractionAt: p.lastInteractionAt ?? p.lastSeenAt,
    cadenceDays: p.cadenceDays ?? null,
  };
}

export const week = query({
  args: { endDate: v.string() },
  handler: async (ctx, { endDate }) => {
    const ownerId = await requireUser(ctx);
    requireDate(endDate);
    const startDate = shiftDate(endDate, -6);
    const rows = await ctx.db
      .query("days")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).gte("date", startDate).lte("date", endDate))
      .take(7);
    return Array.from({ length: 7 }, (_, i) => {
      const date = shiftDate(startDate, i);
      const row = rows.find((r) => r.date === date);
      return { date, score: row?.score ?? null };
    });
  },
});

export const day = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    const ownerId = await requireUser(ctx);
    requireDate(date);
    const row = await ctx.db
      .query("days")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).eq("date", date))
      .unique();
    if (row === null) return null;
    const conversations = await Promise.all(row.conversationIds.map((id) => ctx.db.get("conversations", id)));
    const timeline = await Promise.all(
      conversations
        .filter((c) => c !== null && c.ownerId === ownerId)
        .map((c) => moment(ctx, c!)),
    );
    const peopleFacts = await Promise.all(
      row.people.facts.map(async (f) => ({ ...f, person: await personBrief(ctx, f.personId) })),
    );
    return {
      ...row,
      baselineReady: row.dataDays >= BASELINE_AFTER_DAYS,
      people: {
        ...row.people,
        facts: peopleFacts,
        nudge: row.people.nudgePersonId ? await personBrief(ctx, row.people.nudgePersonId) : null,
      },
      timeline: timeline.sort((a, b) => a.startedAt - b.startedAt),
    };
  },
});

export const evidence = query({
  args: { conversationIds: v.array(v.id("conversations")) },
  handler: async (ctx, { conversationIds }) => {
    const ownerId = await requireUser(ctx);
    const rows = await Promise.all(conversationIds.slice(0, MAX_EVIDENCE).map((id) => ctx.db.get("conversations", id)));
    const owned = rows.filter((c): c is Doc<"conversations"> => c !== null && c.ownerId === ownerId);
    const moments = await Promise.all(owned.map((c) => moment(ctx, c)));
    return moments.sort((a, b) => b.startedAt - a.startedAt);
  },
});

export const profile = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => {
    const ownerId = await requireUser(ctx);
    requireDate(today);
    const [row, traits, recentDays] = await Promise.all([
      ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).unique(),
      ctx.db.query("traits").withIndex("by_ownerId_and_kind", (q) => q.eq("ownerId", ownerId)).take(300),
      ctx.db
        .query("days")
        .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).gte("date", shiftDate(today, -6)).lte("date", today))
        .take(7),
    ]);
    const dataDays = row?.dataDays ?? 0;
    const shown = traits
      .filter((t) => !t.removed)
      .sort((a, b) => b.confidence - a.confidence || b.evidenceCount - a.evidenceCount);
    const minutesByPerson = new Map<Id<"people">, number>();
    for (const d of recentDays) {
      for (const f of d.people.facts) minutesByPerson.set(f.personId, (minutesByPerson.get(f.personId) ?? 0) + f.minutes);
    }
    const top = [...minutesByPerson.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const orbit = (
      await Promise.all(
        top.map(async ([personId, minutes]) => {
          const p = await ctx.db.get("people", personId);
          return p === null
            ? null
            : {
                _id: p._id,
                name: p.name,
                roleLabel: p.roleLabel ?? null,
                relationship: p.relationship ?? null,
                minutes,
                about: (p.topicLabels ?? []).slice(0, 3),
              };
        }),
      )
    ).filter((o) => o !== null);
    return {
      dataDays,
      liftsReady: dataDays >= LIFTS_AFTER_DAYS,
      identity: row?.identity ?? null,
      lifts: dataDays >= LIFTS_AFTER_DAYS ? (row?.lifts ?? []) : [],
      interests: shown.filter((t) => t.kind === "interest"),
      goals: shown.filter((t) => t.kind === "goal"),
      personality: dataDays >= LIFTS_AFTER_DAYS ? shown.filter((t) => t.kind === "personality") : [],
      orbit,
    };
  },
});

export const rateDay = mutation({
  args: {
    date: v.string(),
    verdict: v.union(v.literal("up"), v.literal("down")),
    direction: v.optional(v.union(v.literal("better"), v.literal("worse"))),
  },
  handler: async (ctx, { date, verdict, direction }) => {
    const ownerId = await requireUser(ctx);
    requireDate(date);
    const row = await ctx.db
      .query("days")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).eq("date", date))
      .unique();
    if (row === null) throw new ConvexError("Not found");
    await ctx.db.patch("days", row._id, { userRating: { verdict, direction, at: Date.now() } });
    return null;
  },
});

export const removeTrait = mutation({
  args: { traitId: v.id("traits") },
  handler: async (ctx, { traitId }) => {
    const ownerId = await requireUser(ctx);
    await requireOwned(ctx, "traits", traitId, ownerId);
    await ctx.db.patch("traits", traitId, { removed: true });
    return null;
  },
});

export const refresh = mutation({
  args: { date: v.string(), timeZone: v.optional(v.string()) },
  handler: async (ctx, { date }) => {
    const ownerId = await requireUser(ctx);
    requireDate(date);
    const row = await ctx.db
      .query("days")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).eq("date", date))
      .unique();
    if (row !== null && Date.now() - row.computedAt < REFRESH_THROTTLE_MS) return null;
    await ctx.scheduler.runAfter(0, internal.days.computeDay, { ownerId, date });
    return null;
  },
});
