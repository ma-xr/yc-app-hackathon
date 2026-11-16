import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { computeDayScores } from "./lib/dayScores";

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;
const MAX_CONVERSATIONS = 500;
const MAX_PEOPLE = 500;
const MAX_DAYS = 1000;
const TIME_ZONE = "America/Los_Angeles";

function zoneOffsetMs(utcMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utcMs;
}

export function localDate(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function localTime(date: string, hour: number, minute = 0) {
  const wall = Date.parse(`${date}T00:00:00Z`) + (hour * 60 + minute) * 60 * 1000;
  return wall - zoneOffsetMs(wall - zoneOffsetMs(wall));
}

export function dayBounds(date: string) {
  return { start: localTime(date, 0), end: localTime(shiftDate(date, 1), 0) };
}

const sameIds = (a: Id<"conversations">[], b: Id<"conversations">[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export async function computeDayRow(ctx: MutationCtx, ownerId: Id<"users">, date: string) {
  const { start, end } = dayBounds(date);
  const [found, history, earlier, people, existing] = await Promise.all([
    ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId).gte("startedAt", start).lt("startedAt", end))
      .take(MAX_CONVERSATIONS),
    ctx.db
      .query("days")
      .withIndex("by_ownerId_and_date", (q) =>
        q.eq("ownerId", ownerId).gte("date", shiftDate(date, -HISTORY_DAYS)).lt("date", date),
      )
      .take(HISTORY_DAYS),
    ctx.db
      .query("days")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).lt("date", date))
      .take(MAX_DAYS),
    ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(MAX_PEOPLE),
    ctx.db
      .query("days")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).eq("date", date))
      .unique(),
  ]);
  const conversations = found.filter((c) => c.status !== "listening");
  if (conversations.length === 0) return null;
  const topicIds = [...new Set(conversations.flatMap((c) => c.topicIds ?? []))];
  const topics = await Promise.all(topicIds.map((id) => ctx.db.get("topics", id)));
  const topicLabels = new Map(topics.filter((t) => t !== null).map((t) => [t._id, t.label]));
  const scores = computeDayScores({ conversations, people, topicLabels, history, dayEnd: end, dataDays: earlier.length + 1 });
  const keep = existing !== null && existing.writtenAt !== undefined && sameIds(existing.conversationIds, scores.conversationIds);
  const row: Omit<Doc<"days">, "_id" | "_creationTime"> = {
    ownerId,
    date,
    ...scores,
    computedAt: Date.now(),
    userRating: existing?.userRating,
  };
  if (keep) {
    const moodReason = new Map(existing.mood.facts.map((f) => [`${f.kind}:${f.conversationId}`, f.reason]));
    const personReason = new Map(existing.people.facts.map((f) => [f.personId, f.reason]));
    const placeReason = new Map(existing.activity.facts.map((f) => [f.place, f.reason]));
    row.headline = existing.headline;
    row.take = existing.take;
    row.writtenAt = existing.writtenAt;
    row.mood.desc = existing.mood.desc;
    row.mood.facts = row.mood.facts.map((f) => ({ ...f, reason: moodReason.get(`${f.kind}:${f.conversationId}`) ?? f.reason }));
    row.people.desc = existing.people.desc;
    row.people.facts = row.people.facts.map((f) => ({ ...f, reason: personReason.get(f.personId) ?? f.reason }));
    if (existing.people.nudgePersonId === row.people.nudgePersonId) row.people.nudgeReason = existing.people.nudgeReason;
    row.activity.desc = existing.activity.desc;
    row.activity.facts = row.activity.facts.map((f) => ({ ...f, reason: placeReason.get(f.place) ?? f.reason }));
  }
  if (existing === null) return await ctx.db.insert("days", row);
  await ctx.db.replace("days", existing._id, row);
  return existing._id;
}

export const computeDay = internalMutation({
  args: { ownerId: v.id("users"), date: v.string() },
  handler: async (ctx, { ownerId, date }) => {
    const dayId = await computeDayRow(ctx, ownerId, date);
    if (dayId === null) return null;
    const row = await ctx.db.get("days", dayId);
    if (row?.writtenAt === undefined) await ctx.scheduler.runAfter(0, internal.writer.writeDay, { dayId });
    return dayId;
  },
});

export const computeAll = internalMutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const today = localDate(Date.now());
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) =>
        q.eq("ownerId", ownerId).gte("startedAt", dayBounds(shiftDate(today, -HISTORY_DAYS)).start),
      )
      .take(MAX_CONVERSATIONS * 4);
    const dates = [...new Set(conversations.filter((c) => c.status !== "listening").map((c) => localDate(c.startedAt)))].sort();
    for (const date of dates) await computeDayRow(ctx, ownerId, date);
    return null;
  },
});
