/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
    expect(day?.people.nudge?.name).toBe("Aoife");
    expect(day?.people.nudgeReason).toBe("You haven't talked to Aoife in 12 days. You usually catch up weekly.");
    expect(day?.mood.facts.map((f) => f.title)).toEqual(["High: lunch with Priya", "Low: building with Max", "Steady: meeting with Tomás"]);
    expect(day?.activity.facts.map((f) => f.place)).toEqual(["YC hackathon", "Tartine", "Café Réveille", "Dolores Park"]);

    const week = await alice.query(api.insights.week, { endDate: TODAY });
    const scores = week.map((d) => d.score!);
    expect(scores.every((s) => typeof s === "number")).toBe(true);
    [62, 58, 71, 49, 66, 80, 74].forEach((target, i) => expect(Math.abs(scores[i] - target)).toBeLessThanOrEqual(4));
    expect(Math.min(...scores)).toBe(scores[3]);
    expect(Math.max(...scores)).toBe(scores[5]);

    const { withPriya, without } = await t.run(async (ctx) => {
      const rows = await ctx.db.query("days").withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", aliceId)).take(100);
      const priya = (await ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", aliceId)).take(20)).find(
        (p) => p.name === "Priya Raman",
      )!;
      const has = (r: (typeof rows)[number]) => r.people.facts.some((f) => f.personId === priya._id);
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      return { withPriya: avg(rows.filter(has).map((r) => r.score)), without: avg(rows.filter((r) => !has(r)).map((r) => r.score)) };
    });
    expect(withPriya - without).toBeGreaterThanOrEqual(8);

    const contacts = await alice.query(api.contacts.list, { sort: "time" });
    expect(contacts[0].name).toBe("Max");
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
