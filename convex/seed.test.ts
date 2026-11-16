/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MOCK_CONTACTS } from "../src/components/contacts/data/mock-data";
import { api } from "./_generated/api";
import schema from "./schema";

vi.mock("@convex-dev/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@convex-dev/auth/server")>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject.split("|")[0] ?? null,
}));

const modules = import.meta.glob("./**/*.ts");
const TODAY = "2026-11-15";

async function setup() {
  const t = convexTest(schema, modules);
  const [alice, bob] = await t.run(async (ctx) => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  return { t, alice: t.withIdentity({ subject: `${alice}|a` }), bob: t.withIdentity({ subject: `${bob}|b` }), aliceId: alice };
}

const near = (value: number | undefined, target: number) => expect(Math.abs((value ?? -100) - target)).toBeLessThanOrEqual(3);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.parse("2026-11-15T20:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("seed.demo", () => {
  test("fills Insights with the prototype's numbers", async () => {
    const { t, alice, aliceId } = await setup();
    await alice.mutation(api.seed.demo, {});
    const day = await alice.query(api.insights.day, { date: TODAY });
    near(day?.score, 74);
    near(day?.usual, 64);
    near(day?.mood.score, 68);
    near(day?.people.score, 85);
    near(day?.activity.score, 70);
    expect(day?.baselineReady).toBe(true);
    expect(day?.timeline).toHaveLength(5);
    expect(day?.people.split).toEqual({ work: 285, friend: 60, family: 25, other: 0 });
    expect(day?.people.nudge?.name).toBe("Lena Ortiz");
    expect(day?.people.nudgeReason).toBe("You haven't talked to Lena Ortiz in 12 days. You usually catch up weekly.");
    expect(day?.mood.facts.map((f) => f.title)).toEqual(["High: lunch with Sam", "Low: building with Maya", "Steady: meeting with David"]);
    expect(day?.activity.facts.map((f) => f.place)).toEqual(["YC hackathon", "Tartine", "Café Réveille", "Dolores Park"]);

    const week = await alice.query(api.insights.week, { endDate: TODAY });
    const scores = week.map((d) => d.score!);
    expect(scores.every((s) => typeof s === "number")).toBe(true);
    [62, 58, 71, 49, 66, 80, 74].forEach((target, i) => expect(Math.abs(scores[i] - target)).toBeLessThanOrEqual(4));
    expect(Math.min(...scores)).toBe(scores[3]);
    expect(Math.max(...scores)).toBe(scores[5]);

    const lifts = await t.run(async (ctx) =>
      (await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", aliceId)).unique())!.lifts,
    );
    expect(lifts.map((l) => l.label)).toEqual(["Days with Sam Rivera", "Getting outside", "Lots of meetings"]);
    expect(Math.abs(lifts[0].delta - 17)).toBeLessThanOrEqual(3);
    expect(Math.abs(lifts[1].delta - 12)).toBeLessThanOrEqual(3);
    expect(Math.abs(lifts[2].delta + 14)).toBeLessThanOrEqual(3);
    expect(lifts.every((l) => Math.abs(l.delta) >= 8)).toBe(true);

    const contacts = await alice.query(api.contacts.list, {});
    expect(contacts).toHaveLength(MOCK_CONTACTS.length);
    expect(new Set(contacts.map((c) => c.name))).toEqual(new Set(MOCK_CONTACTS.map((m) => m.name)));
    const cast = ["Maya Chen", "Sam Rivera", "David Okafor", "Ethan Nguyen", "Mom", "Lena Ortiz", "Dev Patel", "Priya Shah"];
    const people = await t.run(async (ctx) => ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", aliceId)).take(100));
    for (const name of cast) {
      const p = people.find((x) => x.name === name)!;
      expect(p.lastInteractionAt).toBeDefined();
      expect(p.encounterCount).toBeGreaterThan(0);
      expect([p.from, p.workingOn, p.howWeMet, p.birthday, p.phone, p.relationshipSummary, p.roleLabel, p.relationship].every((f) => f !== undefined)).toBe(true);
      const lists = [p.interests, p.whatMatters, p.family, p.lifeEvents, p.giftIdeas];
      expect(lists.every((l) => (l?.length ?? 0) > 0)).toBe(true);
      const sourced = [p.from, p.workingOn, p.howWeMet, ...(p.interests ?? []), ...(p.whatMatters ?? []), ...(p.lifeEvents ?? []), ...(p.family ?? [])];
      expect(sourced.some((f) => (f?.conversationIds.length ?? 0) > 0)).toBe(true);
    }
    expect(people.find((p) => p.name === "Sam Rivera")?.roleLabel).toBe("Climbing friend");
    expect(people.filter((p) => !cast.includes(p.name)).every((p) => p.encounterCount === p.conversationCount)).toBe(true);

    const profile = await alice.query(api.insights.profile, { today: TODAY });
    expect(profile.interests.map((i) => i.label)).toEqual(expect.arrayContaining(["AI agents", "Startups", "Climbing", "Film photography"]));
    expect(profile.goals.map((g) => g.label)).toEqual(expect.arrayContaining(["Ship Jesse at the hackathon", "Raise a pre-seed round", "Climb V5 by spring"]));
  });

  test("another user sees none of it, and clear removes it", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.seed.demo, {});
    expect(await bob.query(api.insights.day, { date: TODAY })).toBeNull();
    expect((await bob.query(api.insights.week, { endDate: TODAY })).every((d) => d.score === null)).toBe(true);
    expect(await bob.query(api.contacts.list, {})).toEqual([]);
    await alice.mutation(api.seed.clear, {});
    expect(await alice.query(api.insights.day, { date: TODAY })).toBeNull();
    expect((await alice.query(api.insights.profile, { today: TODAY })).interests).toEqual([]);
  });

  test("signed out cannot seed", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.seed.demo, {})).rejects.toThrow(/Not signed in/);
  });
});
