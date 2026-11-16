/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { dayBounds, localDate, localTime } from "./days";
import { activitySection, computeDayScores, moodSection, peopleSection } from "./lib/dayScores";
import schema from "./schema";

vi.mock("@convex-dev/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@convex-dev/auth/server")>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject.split("|")[0] ?? null,
}));

const modules = import.meta.glob("./**/*.ts");
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const START = Date.parse("2026-11-15T20:00:00Z");

const id = <T extends "conversations" | "people" | "topics">(table: T, n: number) => `${n}${table}` as Id<T>;

function convo(n: number, fields: Partial<Doc<"conversations">> & { minutes?: number; offset?: number }): Doc<"conversations"> {
  const { minutes = 60, offset = 0, ...rest } = fields;
  const startedAt = START + offset * MINUTE;
  return {
    _id: id("conversations", n), _creationTime: 0, ownerId: "1users" as Id<"users">, startedAt, endedAt: startedAt + minutes * MINUTE,
    status: "done", participantIds: [], gist: [], leftOutCount: 0, ...rest,
  };
}

function person(n: number, fields: Partial<Doc<"people">>): Doc<"people"> {
  return {
    _id: id("people", n), _creationTime: 0, ownerId: "1users" as Id<"users">, name: `P${n}`, facts: [], lastSeenAt: START, conversationCount: 1,
    ...fields,
  };
}

const prior = (score: number, totalMinutes: number) => ({ score, mood: { score }, people: { score, totalMinutes }, activity: { score } });

describe("dayScores formulas", () => {
  test("mood is the minute-weighted mean mapped to 0-100 with high, low and steady facts", () => {
    const priya = person(1, { name: "Priya Raman" });
    const names = new Map([[priya._id, priya.name]]);
    const mood = moodSection(
      [
        convo(1, { minutes: 60, mood: 2, participantIds: [priya._id], activityType: "meal", moodReason: "laughing" }),
        convo(2, { minutes: 30, offset: 90, mood: -1, placeName: "Home", activityType: "building" }),
        convo(3, { minutes: 30, offset: 200, mood: 0, activityType: "outdoors" }),
        convo(4, { minutes: 30, offset: 300 }),
      ],
      names,
    );
    expect(mood.score).toBe(69);
    expect(mood.curve.map((p) => p.value)).toEqual([2, -1, 0]);
    expect(mood.facts.map((f) => [f.kind, f.title, f.reason])).toEqual([
      ["high", "High: lunch with Priya", "laughing"],
      ["low", "Low: building at Home", ""],
      ["steady", "Steady: walk", ""],
    ]);
    expect(moodSection([], names).score).toBe(50);
  });

  test("people scores social minutes against the baseline, splits by relationship and nudges the most overdue", () => {
    const friend = person(1, { relationship: "friend" });
    const coworker = person(2, { relationship: "work" });
    const aoife = person(3, { name: "Aoife", cadenceDays: 7, lastInteractionAt: START - 12 * DAY });
    const mom = person(4, { name: "Mom", cadenceDays: 7, lastInteractionAt: START - 11 * DAY });
    const people = [friend, coworker, aoife, mom];
    const topics = new Map([[id("topics", 1), "Climbing"]]);
    const conversations = [
      convo(1, { minutes: 60, mood: 2, participantIds: [friend._id], topicIds: [id("topics", 1)] }),
      convo(2, { minutes: 120, offset: 60, mood: -1, participantIds: [friend._id, coworker._id], summaryLine: "Demo plan" }),
      convo(3, { minutes: 30, offset: 200 }),
      convo(4, { minutes: 300, offset: 300, channel: "imessage", participantIds: [coworker._id] }),
    ];
    const dayEnd = START + 6 * 60 * MINUTE;
    const first = peopleSection(conversations, people, topics, [], dayEnd);
    expect(first.totalMinutes).toBe(185);
    expect(first.score).toBe(72);
    expect(first.split).toEqual({ work: 125, friend: 180, family: 0, other: 0 });
    expect(first.facts.map((f) => [f.personId, f.minutes, f.mood, f.reason])).toEqual([
      [friend._id, 180, 0, "Climbing"],
      [coworker._id, 125, -1, "Demo plan"],
    ]);
    expect(first.nudgePersonId).toBe(aoife._id);
    expect(first.nudgeReason).toBe("You haven't talked to Aoife in 12 days. You usually catch up weekly.");
    expect(peopleSection(conversations, people, topics, [prior(50, 370), prior(50, 0)], dayEnd).score).toBe(70);
    expect(peopleSection(conversations, people, topics, [prior(50, 90)], dayEnd).score).toBe(100);
  });

  test("activity rewards places, types, getting outside and one focus block", () => {
    const conversations = [
      convo(1, { minutes: 90, placeName: "Hackathon", activityType: "building", summaryLine: "Expo build", topicMix: { work: 1, personal: 0, logistics: 0 } }),
      convo(2, { minutes: 40, offset: 100, placeName: "Hackathon", activityType: "meeting", summaryLine: "Demo plan" }),
      convo(3, { minutes: 60, offset: 200, placeName: "Tartine", activityType: "meal", topicMix: { work: 0, personal: 0.5, logistics: 0.5 } }),
      convo(4, { minutes: 30, offset: 300, place: "Park", activityType: "outdoors" }),
    ];
    const activity = activitySection(conversations);
    expect(activity.score).toBe(8 * 3 + 5 * 4 + 10 + 10);
    expect(activity.timeSplit).toEqual([
      { activityType: "building", minutes: 90 },
      { activityType: "meal", minutes: 60 },
      { activityType: "meeting", minutes: 40 },
      { activityType: "outdoors", minutes: 30 },
    ]);
    expect(activity.talkSplit).toEqual({ work: 0.6, personal: 0.2, logistics: 0.2 });
    expect(activity.facts[0]).toMatchObject({ place: "Hackathon", activityType: "building", minutes: 130, reason: "Expo build; Demo plan" });
    const gap = activitySection([conversations[0], { ...conversations[1], startedAt: START + 200 * MINUTE }]);
    expect(gap.score).toBe(8 + 10);
  });

  test("day score is the mean of the sections, usual waits for 7 data days", () => {
    const input = {
      conversations: [convo(1, { minutes: 60, mood: 2, placeName: "Tartine", activityType: "meal" as const })],
      people: [],
      topicLabels: new Map(),
      history: [prior(60, 100), prior(70, 100)],
      dayEnd: START + DAY,
    };
    const early = computeDayScores({ ...input, dataDays: 6 });
    expect(early.score).toBe(Math.round((100 + 0 + 13) / 3));
    expect(early.usual).toBeUndefined();
    const ready = computeDayScores({ ...input, dataDays: 7 });
    expect([ready.usual, ready.mood.usual, ready.people.usual, ready.activity.usual]).toEqual([65, 65, 65, 65]);
    expect(ready.headline?.length).toBeGreaterThan(0);
  });
});

describe("local dates", () => {
  test("day bounds follow DST", () => {
    expect(dayBounds("2026-11-01").end - dayBounds("2026-11-01").start).toBe(25 * 60 * MINUTE);
    expect(dayBounds("2026-03-08").end - dayBounds("2026-03-08").start).toBe(23 * 60 * MINUTE);
    expect(dayBounds("2026-11-15").start).toBe(Date.parse("2026-11-15T08:00:00Z"));
    expect(localTime("2026-07-04", 9, 30)).toBe(Date.parse("2026-07-04T16:30:00Z"));
    expect(localDate(Date.parse("2026-11-16T07:59:00Z"))).toBe("2026-11-15");
  });
});

async function setup() {
  const t = convexTest(schema, modules);
  const [alice, bob] = await t.run(async (ctx) => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  return { t, alice: t.withIdentity({ subject: `${alice}|a` }), aliceId: alice, bobId: bob };
}

describe("computeDay", () => {
  test("is idempotent, DST-safe and keeps written text only while the conversations are unchanged", async () => {
    const { t, aliceId, bobId } = await setup();
    const date = "2026-11-01";
    await t.run(async (ctx) => {
      const base = { ownerId: aliceId, status: "done" as const, participantIds: [], gist: [], leftOutCount: 0, mood: 1, activityType: "building" as const };
      await ctx.db.insert("conversations", { ...base, startedAt: localTime(date, 0, 30), endedAt: localTime(date, 1, 30) });
      await ctx.db.insert("conversations", { ...base, startedAt: localTime(date, 23, 30), endedAt: localTime(date, 23, 50) });
      await ctx.db.insert("conversations", { ...base, startedAt: localTime("2026-11-02", 0, 10) });
      await ctx.db.insert("conversations", { ...base, startedAt: localTime(date, 12, 0), status: "listening" });
      await ctx.db.insert("conversations", { ...base, ownerId: bobId, startedAt: localTime(date, 12, 0) });
    });
    const first = await t.mutation(internal.days.computeDay, { ownerId: aliceId, date });
    const second = await t.mutation(internal.days.computeDay, { ownerId: aliceId, date });
    expect(second).toBe(first);
    const rows = await t.run(async (ctx) => ctx.db.query("days").take(10));
    expect(rows).toHaveLength(1);
    expect(rows[0].conversationIds).toHaveLength(2);
    expect(rows[0].mood.score).toBe(75);
    expect(rows[0].dataDays).toBe(1);

    await t.run(async (ctx) => {
      await ctx.db.patch("days", rows[0]._id, { headline: "Written", writtenAt: 1, userRating: { verdict: "up", at: 1 } });
    });
    await t.mutation(internal.days.computeDay, { ownerId: aliceId, date });
    let row = (await t.run(async (ctx) => ctx.db.get("days", rows[0]._id)))!;
    expect([row.headline, row.writtenAt, row.userRating?.verdict]).toEqual(["Written", 1, "up"]);

    await t.run(async (ctx) => {
      await ctx.db.insert("conversations", {
        ownerId: aliceId, status: "done", participantIds: [], gist: [], leftOutCount: 0, startedAt: localTime(date, 15, 0), endedAt: localTime(date, 16, 0),
      });
    });
    await t.mutation(internal.days.computeDay, { ownerId: aliceId, date });
    row = (await t.run(async (ctx) => ctx.db.get("days", rows[0]._id)))!;
    expect(row.headline).not.toBe("Written");
    expect(row.writtenAt).toBeUndefined();
    expect(row.userRating?.verdict).toBe("up");
    expect(row.conversationIds).toHaveLength(3);

    expect(await t.mutation(internal.days.computeDay, { ownerId: aliceId, date: "2026-10-01" })).toBeNull();
  });

  test("computeAll fills every recent date oldest first", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-15T20:00:00Z"));
    try {
      const { t, aliceId } = await setup();
      await t.run(async (ctx) => {
        for (let i = 0; i < 8; i++) {
          const date = new Date(Date.parse("2026-11-08T12:00:00Z") + i * DAY).toISOString().slice(0, 10);
          await ctx.db.insert("conversations", {
            ownerId: aliceId, status: "done", participantIds: [], gist: [], leftOutCount: 0, mood: 0,
            startedAt: localTime(date, 10, 0), endedAt: localTime(date, 11, 0),
          });
        }
      });
      await t.mutation(internal.days.computeAll, { ownerId: aliceId });
      const rows = await t.run(async (ctx) => ctx.db.query("days").withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", aliceId)).take(20));
      expect(rows.map((r) => r.dataDays)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(rows[5].usual).toBeUndefined();
      expect(rows[6].usual).toBe(rows[0].score);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("insights.refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-11-15T20:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("signed out throws", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.insights.refresh, { date: "2026-11-15" })).rejects.toThrow(/Not signed in/);
  });

  test("schedules a compute unless the day was computed in the last 2 minutes", async () => {
    const { t, alice, aliceId } = await setup();
    const scheduled = () => t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").take(10)).filter((f) => f.name.includes("computeDay")).length);
    await t.run(async (ctx) => {
      await ctx.db.insert("conversations", {
        ownerId: aliceId, status: "done", participantIds: [], gist: [], leftOutCount: 0, mood: 2, startedAt: localTime("2026-11-15", 9, 0),
      });
    });
    await alice.mutation(api.insights.refresh, { date: "2026-11-15" });
    expect(await scheduled()).toBe(1);
    await t.mutation(internal.days.computeDay, { ownerId: aliceId, date: "2026-11-15" });
    await alice.mutation(api.insights.refresh, { date: "2026-11-15" });
    expect(await scheduled()).toBe(1);
    vi.setSystemTime(Date.parse("2026-11-15T20:03:00Z"));
    await alice.mutation(api.insights.refresh, { date: "2026-11-15" });
    expect(await scheduled()).toBe(2);
  });
});
