/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { detectTold } from "./traits";

const modules = import.meta.glob("./**/*.ts");
const HOUR = 60 * 60 * 1000;
const realKey = process.env.OPENAI_API_KEY;
const newTester = () => convexTest(schema, modules);
type Tester = ReturnType<typeof newTester>;

function llmReturns(content: unknown) {
  return vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 }));
}

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (realKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = realKey;
});

async function seedClimbing(t: Tester) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {});
    const priya = await ctx.db.insert("people", { ownerId, name: "Priya", facts: [], lastSeenAt: 0, conversationCount: 3 });
    const topic = await ctx.db.insert("topics", { ownerId, label: "climbing", subIdeas: [], conversationCount: 3, peopleCount: 1, lastSeenAt: 0 });
    const conversationIds: Id<"conversations">[] = [];
    for (let i = 0; i < 3; i++) {
      const startedAt = Date.parse("2026-11-10T18:00:00Z") + i * 24 * HOUR;
      conversationIds.push(
        await ctx.db.insert("conversations", {
          ownerId, startedAt, endedAt: startedAt + HOUR, status: "done", participantIds: [priya], gist: [], leftOutCount: 0, topicIds: [topic], mood: 2,
        }),
      );
    }
    return { ownerId, priya, conversationIds };
  });
}

async function traitsOf(t: Tester, ownerId: Id<"users">, kind: "interest" | "goal" | "personality" = "interest") {
  return await t.run(async (ctx) => await ctx.db.query("traits").withIndex("by_ownerId_and_kind", (q) => q.eq("ownerId", ownerId).eq("kind", kind)).take(50));
}

describe("learnTraits", () => {
  test("upserts learned interests and never resurrects a removed one", async () => {
    const t = newTester();
    const { ownerId, conversationIds } = await seedClimbing(t);
    await t.action(internal.traits.learnTraits, { ownerId });
    await t.action(internal.traits.learnTraits, { ownerId });
    const [climbing] = await traitsOf(t, ownerId);
    expect(await traitsOf(t, ownerId)).toHaveLength(1);
    expect(climbing).toMatchObject({
      kind: "interest", label: "Climbing", source: "learned", evidenceCount: 3, removed: false,
      reason: "3 conversations, mostly with Priya, usually upbeat",
    });
    expect([...climbing.evidence].sort()).toEqual([...conversationIds].sort());
    expect((await traitsOf(t, ownerId, "personality")).map((x) => [x.label, x.reason])).toEqual([
      ["At your best in the morning", "3 of your 3 longest upbeat conversations were in the morning"],
    ]);
    await t.run(async (ctx) => await ctx.db.patch("traits", climbing._id, { removed: true }));
    await t.action(internal.traits.learnTraits, { ownerId });
    const after = await traitsOf(t, ownerId);
    expect(after).toHaveLength(1);
    expect(after[0].removed).toBe(true);
  });

  test("keeps the LLM reason only when its numbers match", async () => {
    const t = newTester();
    const { ownerId } = await seedClimbing(t);
    process.env.OPENAI_API_KEY = "test";
    vi.stubGlobal("fetch", llmReturns({ reasons: ["You keep coming back to climbing with Priya, 3 times lately"] }));
    await t.action(internal.traits.learnTraits, { ownerId });
    expect((await traitsOf(t, ownerId))[0].reason).toBe("You keep coming back to climbing with Priya, 3 times lately");
    vi.stubGlobal("fetch", llmReturns({ reasons: ["Climbing came up 9 times"] }));
    await t.action(internal.traits.learnTraits, { ownerId });
    expect((await traitsOf(t, ownerId))[0].reason).toBe("3 conversations, mostly with Priya, usually upbeat");
  });

  test("tell creates a told trait that learning updates but never relabels", async () => {
    const t = newTester();
    const { ownerId, conversationIds } = await seedClimbing(t);
    const traitId = await t.mutation(internal.traits.tell, { ownerId, kind: "goal", label: " run a half marathon ", statement: "I want to run a half" });
    const told = await t.run(async (ctx) => await ctx.db.get("traits", traitId));
    expect(told).toMatchObject({ kind: "goal", label: "Run a half marathon", source: "told", confidence: 1, evidenceCount: 0, removed: false });
    expect(told?.reason).toMatch(/^You told Jesse on [A-Z][a-z]{2} \d{1,2}$/);
    expect(JSON.stringify(told)).not.toContain("I want to run");
    await t.run(async (ctx) => {
      await ctx.db.insert("items", {
        ownerId, conversationId: conversationIds[0], kind: "goal", text: "Run a half marathon", importance: 3, status: "open", editedByUser: false,
      });
    });
    await t.action(internal.traits.learnTraits, { ownerId });
    const after = await t.run(async (ctx) => await ctx.db.get("traits", traitId));
    expect(after).toMatchObject({ source: "told", reason: told?.reason, evidenceCount: 1, evidence: [conversationIds[0]] });
    expect(await traitsOf(t, ownerId, "goal")).toHaveLength(1);
  });

  test("detectTold returns labels and degrades to empty", async () => {
    vi.stubGlobal("fetch", llmReturns({ traits: [{ kind: "interest", label: "bouldering" }, { kind: "nope", label: "x" }] }));
    expect(await detectTold("I've really gotten into bouldering", "test")).toEqual([{ kind: "interest", label: "Bouldering" }]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    expect(await detectTold("I've really gotten into bouldering", "test")).toEqual([]);
  });
});

async function seedDay(t: Tester) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {});
    const start = Date.parse("2026-11-14T20:00:00Z");
    const priya = await ctx.db.insert("people", { ownerId, name: "Priya", facts: [], lastSeenAt: start, conversationCount: 1, roleLabel: "Friend" });
    const conversationId = await ctx.db.insert("conversations", {
      ownerId, startedAt: start, endedAt: start + HOUR, status: "done", participantIds: [priya], gist: [], leftOutCount: 0,
      placeName: "Tartine", mood: 2, moodReason: "easy laughter", activityType: "meal", summaryLine: "Climbing trip plans",
    });
    const dayId = await ctx.db.insert("days", {
      ownerId, date: "2026-11-14", score: 74, usual: 64, headline: "Fallback headline", take: "Fallback take.",
      mood: { score: 90, desc: "Fallback mood.", curve: [{ at: start, value: 2, conversationId }],
        facts: [{ kind: "high", conversationId, at: start, mood: 2, personIds: [priya], place: "Tartine", title: "Lunch high", reason: "Fallback mood reason" }] },
      people: { score: 70, desc: "Fallback people.", totalMinutes: 60, personCount: 1, split: { work: 0, friend: 60, family: 0, other: 0 },
        facts: [{ personId: priya, minutes: 60, mood: 2, conversationIds: [conversationId], reason: "Fallback people reason" }], nudgePersonId: priya, nudgeReason: "Fallback nudge" },
      activity: { score: 60, desc: "Fallback activity.", timeSplit: [{ activityType: "meal", minutes: 60 }], talkSplit: { work: 0, personal: 1, logistics: 0 },
        facts: [{ place: "Tartine", activityType: "meal", minutes: 60, conversationIds: [conversationId], reason: "Fallback activity reason" }] },
      conversationIds: [conversationId], dataDays: 7, computedAt: start,
    });
    return { dayId, conversationId };
  });
}

const goodWords = {
  headline: "A warm lunch at Tartine",
  take: "You laughed easily over an hour with Priya. It lifted your whole day.",
  moodDesc: "Your mood peaked at lunch. Easy laughter carried it.",
  peopleDesc: "You spent 60 minutes with Priya. It was all friend time.",
  activityDesc: "Lunch at Tartine was the anchor of the day.",
  nudgeReason: "Priya would love to hear how the trip plans are going.",
  moodFacts: [{ title: "Lunch with Priya", reason: "Laughing about climbing plans at Tartine" }],
  peopleReasons: ["An hour of easy talk about a climbing trip"],
  activityReasons: ["Spent 45 minutes eating"],
};

describe("writeDay", () => {
  test("patches words only, keeps numbers, and rejects invented numbers", async () => {
    const t = newTester();
    const { dayId } = await seedDay(t);
    const before = await t.run(async (ctx) => await ctx.db.get("days", dayId));
    process.env.OPENAI_API_KEY = "test";
    const fetch = llmReturns(goodWords);
    vi.stubGlobal("fetch", fetch);
    expect(await t.action(internal.writer.writeDay, { dayId })).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    const after = await t.run(async (ctx) => await ctx.db.get("days", dayId));
    expect(after?.headline).toBe(goodWords.headline);
    expect(after?.take).toBe(goodWords.take);
    expect(after?.mood.desc).toBe(goodWords.moodDesc);
    expect(after?.mood.facts[0]).toEqual({ ...before!.mood.facts[0], title: "Lunch with Priya", reason: goodWords.moodFacts[0].reason });
    expect(after?.people.facts[0]).toEqual({ ...before!.people.facts[0], reason: goodWords.peopleReasons[0] });
    expect(after?.people.nudgeReason).toBe(goodWords.nudgeReason);
    expect(after?.activity.facts[0].reason).toBe("Fallback activity reason");
    expect(after?.writtenAt).toBeTypeOf("number");
    expect({ ...after, headline: 0, take: 0, writtenAt: 0, mood: { ...after!.mood, desc: 0, facts: 0 }, people: { ...after!.people, desc: 0, facts: 0, nudgeReason: 0 }, activity: { ...after!.activity, desc: 0, facts: 0 } }).toEqual({
      ...before, headline: 0, take: 0, writtenAt: 0, mood: { ...before!.mood, desc: 0, facts: 0 }, people: { ...before!.people, desc: 0, facts: 0, nudgeReason: 0 }, activity: { ...before!.activity, desc: 0, facts: 0 },
    });
  });

  test("keeps the fallback when the call fails, the key is missing, or the day changed", async () => {
    const t = newTester();
    const { dayId, conversationId } = await seedDay(t);
    const before = await t.run(async (ctx) => await ctx.db.get("days", dayId));
    expect(await t.action(internal.writer.writeDay, { dayId })).toBe(false);
    process.env.OPENAI_API_KEY = "test";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    expect(await t.action(internal.writer.writeDay, { dayId })).toBe(false);
    expect(await t.run(async (ctx) => await ctx.db.get("days", dayId))).toEqual(before);
    vi.stubGlobal("fetch", vi.fn(async () => {
      await t.run(async (ctx) => await ctx.db.patch("days", dayId, { conversationIds: [conversationId, conversationId] }));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(goodWords) } }] }), { status: 200 });
    }));
    expect(await t.action(internal.writer.writeDay, { dayId })).toBe(false);
    const after = await t.run(async (ctx) => await ctx.db.get("days", dayId));
    expect(after?.headline).toBe("Fallback headline");
    expect(after?.writtenAt).toBeUndefined();
  });
});
