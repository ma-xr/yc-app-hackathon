/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { computeLifts, type LiftDay } from "./lib/lifts";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const priya = "priya" as Id<"people">;
const max = "max" as Id<"people">;

function day(n: number, score: number, people: Id<"people">[], places: string[], activityTypes: string[]): LiftDay {
  return {
    date: `2026-11-0${n}`,
    score,
    people: people.map((personId) => ({ personId, name: personId === priya ? "Priya" : "Max" })),
    places,
    activityTypes,
  };
}

const week = [
  day(1, 80, [priya], ["Tartine"], ["exercise", "meal"]),
  day(2, 82, [priya], ["Tartine"], ["exercise", "meal"]),
  day(3, 84, [priya], [], ["exercise", "meal"]),
  day(4, 60, [max], ["Tartine"], ["exercise", "meal", "meeting"]),
  day(5, 62, [max], [], ["meal", "meeting"]),
  day(6, 64, [max], [], ["meal", "meeting"]),
];

describe("computeLifts", () => {
  test("keeps the top two positive and the top negative with exact numbers", () => {
    expect(computeLifts(week)).toEqual([
      {
        kind: "person", key: priya, label: "Priya", personId: priya, delta: 20, withAvg: 82, withoutAvg: 62,
        withDays: ["2026-11-01", "2026-11-02", "2026-11-03"], note: "Your average day score is 82 with Priya and 62 without",
      },
      {
        kind: "activityType", key: "exercise", label: "exercise", delta: 14, withAvg: 77, withoutAvg: 63,
        withDays: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"], note: "Your average day score is 77 on days with exercise and 63 without",
      },
      {
        kind: "person", key: max, label: "Max", personId: max, delta: -20, withAvg: 62, withoutAvg: 82,
        withDays: ["2026-11-04", "2026-11-05", "2026-11-06"], note: "Your average day score is 62 with Max and 82 without",
      },
    ]);
  });

  test("drops small deltas, things present every day, and thin data", () => {
    const keys = computeLifts(week).map((l) => l.key);
    expect(keys).not.toContain("Tartine");
    expect(keys).not.toContain("meal");
    expect(computeLifts(week.slice(0, 4))).toEqual([]);
  });
});

describe("computeProfile", () => {
  test("counts days rows and stores lifts from conversation labels", async () => {
    const t = convexTest(schema, modules);
    const ownerId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", {});
      const p = await ctx.db.insert("people", { ownerId, name: "Priya", facts: [], lastSeenAt: 0, conversationCount: 3 });
      const scores = [80, 82, 84, 60, 62, 64];
      for (const [i, score] of scores.entries()) {
        const startedAt = Date.parse(`2026-11-0${i + 1}T18:00:00Z`);
        const conversationId = await ctx.db.insert("conversations", {
          ownerId, startedAt, endedAt: startedAt + 3600000, status: "done", participantIds: i < 3 ? [p] : [], gist: [], leftOutCount: 0,
          placeName: "Home", activityType: "meal",
        });
        await ctx.db.insert("days", {
          ownerId, date: `2026-11-0${i + 1}`, score,
          mood: { score, desc: "", curve: [], facts: [] },
          people: { score, desc: "", totalMinutes: 0, personCount: 0, split: { work: 0, friend: 0, family: 0, other: 0 }, facts: [] },
          activity: { score, desc: "", timeSplit: [], talkSplit: { work: 0, personal: 1, logistics: 0 }, facts: [] },
          conversationIds: [conversationId], dataDays: i + 1, computedAt: startedAt,
        });
      }
      return ownerId;
    });
    await t.mutation(internal.profiles.computeProfile, { ownerId });
    const profile = await t.run(async (ctx) => await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).unique());
    expect(profile?.dataDays).toBe(6);
    expect(profile?.lifts.map((l) => [l.label, l.delta])).toEqual([["Priya", 20]]);
  });
});
