/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

vi.mock("@convex-dev/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@convex-dev/auth/server")>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject.split("|")[0] ?? null,
}));

const modules = import.meta.glob("./**/*.ts");
const HOUR = 60 * 60 * 1000;

async function setup() {
  const t = convexTest(schema, modules);
  const [alice, bob] = await t.run(async (ctx) => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  return { t, alice: t.withIdentity({ subject: `${alice}|a` }), bob: t.withIdentity({ subject: `${bob}|b` }), aliceId: alice };
}

async function seedAlice(t: ReturnType<typeof convexTest>, ownerId: Id<"users">) {
  return await t.run(async (ctx) => {
    const start = Date.parse("2026-11-15T17:00:00Z");
    const priya = await ctx.db.insert("people", {
      ownerId, name: "Priya", facts: [], lastSeenAt: start, conversationCount: 1,
      relationship: "friend", roleLabel: "Friend", totalMinutes: 60, lastInteractionAt: start, distinctTopicCount: 2, funScore: 90,
    });
    const max = await ctx.db.insert("people", {
      ownerId, name: "Max", facts: [], lastSeenAt: start - HOUR, conversationCount: 3,
      relationship: "work", totalMinutes: 240, lastInteractionAt: start - HOUR, distinctTopicCount: 5, funScore: 40,
    });
    const conversationId = await ctx.db.insert("conversations", {
      ownerId, startedAt: start, endedAt: start + HOUR, status: "done", participantIds: [priya], gist: [], leftOutCount: 0,
      placeName: "Tartine", mood: 2, activityType: "meal", summaryLine: "Climbing trip and her new job",
    });
    await ctx.db.insert("days", {
      ownerId, date: "2026-11-15", score: 74, usual: 64, headline: "A good day", take: "Nice.",
      mood: { score: 68, desc: "Up", curve: [{ at: start, value: 2, conversationId }], facts: [] },
      people: { score: 85, desc: "", totalMinutes: 60, personCount: 1, split: { work: 0, friend: 60, family: 0, other: 0 },
        facts: [{ personId: priya, minutes: 60, mood: 2, conversationIds: [conversationId], reason: "Fun" }], nudgePersonId: max },
      activity: { score: 70, desc: "", timeSplit: [{ activityType: "meal", minutes: 60 }], talkSplit: { work: 0, personal: 1, logistics: 0 }, facts: [] },
      conversationIds: [conversationId], dataDays: 7, computedAt: start,
    });
    const traitId = await ctx.db.insert("traits", {
      ownerId, kind: "interest", label: "Climbing", reason: "6 conversations", source: "learned",
      evidenceCount: 6, evidence: [conversationId], confidence: 0.8, lastSeenAt: start, removed: false,
    });
    await ctx.db.insert("profiles", { ownerId, identity: "A builder.", lifts: [], dataDays: 7, computedAt: start });
    return { priya, max, conversationId, traitId };
  });
}

describe("insights and contacts authz", () => {
  test("every public function needs a signed-in user", async () => {
    const { t, aliceId } = await setup();
    const { priya, conversationId, traitId } = await seedAlice(t, aliceId);
    const signedOut = [
      t.query(api.insights.week, { endDate: "2026-11-15" }),
      t.query(api.insights.day, { date: "2026-11-15" }),
      t.query(api.insights.evidence, { conversationIds: [conversationId] }),
      t.query(api.insights.profile, { today: "2026-11-15" }),
      t.mutation(api.insights.rateDay, { date: "2026-11-15", verdict: "up" }),
      t.mutation(api.insights.removeTrait, { traitId }),
      t.mutation(api.insights.refresh, { date: "2026-11-15" }),
      t.query(api.contacts.list, {}),
      t.query(api.contacts.get, { personId: priya }),
    ];
    for (const call of signedOut) await expect(call).rejects.toThrow(/Not signed in/);
  });

  test("another user sees nothing of alice's", async () => {
    const { t, bob, aliceId } = await setup();
    const { priya, conversationId, traitId } = await seedAlice(t, aliceId);
    expect(await bob.query(api.insights.day, { date: "2026-11-15" })).toBeNull();
    expect((await bob.query(api.insights.week, { endDate: "2026-11-15" })).every((d) => d.score === null)).toBe(true);
    expect(await bob.query(api.insights.evidence, { conversationIds: [conversationId] })).toEqual([]);
    const profile = await bob.query(api.insights.profile, { today: "2026-11-15" });
    expect(profile.identity).toBeNull();
    expect(profile.interests).toEqual([]);
    expect(await bob.query(api.contacts.list, {})).toEqual([]);
    await expect(bob.query(api.contacts.get, { personId: priya })).rejects.toThrow(/Not found/);
    await expect(bob.mutation(api.insights.removeTrait, { traitId })).rejects.toThrow(/Not found/);
    await expect(bob.mutation(api.insights.rateDay, { date: "2026-11-15", verdict: "down" })).rejects.toThrow(/Not found/);
  });

  test("owner reads the documented shapes", async () => {
    const { t, alice, aliceId } = await setup();
    const { priya, max, traitId } = await seedAlice(t, aliceId);
    const week = await alice.query(api.insights.week, { endDate: "2026-11-15" });
    expect(week.map((d) => d.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(week[6].score).toBe(74);
    const day = await alice.query(api.insights.day, { date: "2026-11-15" });
    expect(day?.baselineReady).toBe(true);
    expect(day?.people.facts[0].person?.name).toBe("Priya");
    expect(day?.people.nudge?._id).toBe(max);
    expect(day?.timeline[0]).toMatchObject({ place: "Tartine", minutes: 60, mood: 2, people: [{ name: "Priya" }] });
    const profile = await alice.query(api.insights.profile, { today: "2026-11-15" });
    expect(profile.orbit[0]).toMatchObject({ name: "Priya", minutes: 60 });
    expect(profile.interests[0].label).toBe("Climbing");
    await alice.mutation(api.insights.removeTrait, { traitId });
    expect((await alice.query(api.insights.profile, { today: "2026-11-15" })).interests).toEqual([]);
    await alice.mutation(api.insights.rateDay, { date: "2026-11-15", verdict: "down", direction: "better" });
    expect((await alice.query(api.insights.day, { date: "2026-11-15" }))?.userRating?.direction).toBe("better");
    expect((await alice.query(api.contacts.list, { sort: "time" })).map((p) => p._id)).toEqual([max, priya]);
    expect((await alice.query(api.contacts.list, { sort: "recent" })).map((p) => p._id)).toEqual([priya, max]);
    expect((await alice.query(api.contacts.list, { sort: "deepest" })).map((p) => p._id)).toEqual([max, priya]);
    expect((await alice.query(api.contacts.list, { sort: "fun" })).map((p) => p._id)).toEqual([priya, max]);
    const contact = await alice.query(api.contacts.get, { personId: priya });
    expect(contact.conversations).toHaveLength(1);
  });
});
