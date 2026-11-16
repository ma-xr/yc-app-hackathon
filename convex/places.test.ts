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
const CAFE = { lat: 37.7764, lng: -122.4231 };
const HOME = { lat: 37.7599, lng: -122.4148 };

async function setup() {
  const t = convexTest(schema, modules);
  const [alice, bob] = await t.run(async (ctx) => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  return {
    t,
    alice: t.withIdentity({ subject: `${alice}|session-a` }),
    bob: t.withIdentity({ subject: `${bob}|session-b` }),
    aliceId: alice,
    bobId: bob,
  };
}

async function conversation(t: ReturnType<typeof convexTest>, ownerId: Id<"users">, fields: { startedAt: number; participantIds?: Id<"people">[]; at?: { lat: number; lng: number }; placeName?: string; status?: "listening" | "done" }) {
  return await t.run((ctx) =>
    ctx.db.insert("conversations", {
      ownerId,
      startedAt: fields.startedAt,
      status: fields.status ?? "done",
      participantIds: fields.participantIds ?? [],
      gist: ["Talked about the move"],
      leftOutCount: 0,
      location: fields.at,
      placeName: fields.placeName,
    }),
  );
}

describe("places authz", () => {
  test("every function needs a signed-in user", async () => {
    const { t } = await setup();
    const now = Date.now();
    await expect(t.mutation(api.places.record, { pings: [] })).rejects.toThrow(/Not signed in/);
    await expect(t.query(api.places.week, { now })).rejects.toThrow(/Not signed in/);
    await expect(t.query(api.places.insights, { now })).rejects.toThrow(/Not signed in/);
    await expect(t.query(api.places.pendingTag, {})).rejects.toThrow(/Not signed in/);
    await expect(t.query(api.places.status, {})).rejects.toThrow(/Not signed in/);
    await expect(t.mutation(api.places.deleteHistory, {})).rejects.toThrow(/Not signed in/);
  });

  test("a user cannot tag someone else's conversation, and nothing is written", async () => {
    const { t, alice, bob, aliceId } = await setup();
    const id = await conversation(t, aliceId, { startedAt: Date.now(), status: "listening" });
    await expect(
      bob.mutation(api.places.record, {
        conversationId: id,
        pings: [{ ...CAFE, ts: Date.now(), source: "conversation", placeName: "Somewhere" }],
      }),
    ).rejects.toThrow(/Not found/);
    expect(await t.run((ctx) => ctx.db.query("locationPings").collect())).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.get("conversations", id)))?.location).toBeUndefined();
    expect(await alice.query(api.places.pendingTag, {})).toEqual({ conversationId: id, startedAt: expect.any(Number) });
    expect(await bob.query(api.places.pendingTag, {})).toBeNull();
  });

  test("the owner tags their own conversation once", async () => {
    const { t, alice, aliceId } = await setup();
    const id = await conversation(t, aliceId, { startedAt: Date.now(), status: "listening" });
    await alice.mutation(api.places.record, {
      conversationId: id,
      pings: [{ ...CAFE, accuracy: 12, ts: Date.now(), source: "conversation", placeName: "  Blue   Bottle " }],
    });
    await alice.mutation(api.places.record, {
      conversationId: id,
      pings: [{ ...HOME, ts: Date.now(), source: "conversation", placeName: "Home" }],
    });
    const doc = await t.run((ctx) => ctx.db.get("conversations", id));
    expect(doc?.location).toEqual({ ...CAFE, accuracy: 12 });
    expect(doc?.placeName).toBe("Blue Bottle");
    expect(await alice.query(api.places.pendingTag, {})).toBeNull();
  });

  test("invalid or out-of-range pings are dropped and big batches refused", async () => {
    const { alice } = await setup();
    const now = Date.now();
    const kept = await alice.mutation(api.places.record, {
      pings: [
        { ...CAFE, ts: now, source: "foreground" },
        { lat: 91, lng: 0, ts: now, source: "foreground" },
        { ...CAFE, accuracy: -1, ts: now, source: "foreground" },
        { ...CAFE, ts: now + 24 * HOUR, source: "background" },
        { ...CAFE, ts: now - 30 * 24 * HOUR, source: "background" },
      ],
    });
    expect(kept).toBe(1);
    const tooMany = Array.from({ length: 201 }, () => ({ ...CAFE, ts: now, source: "foreground" as const }));
    await expect(alice.mutation(api.places.record, { pings: tooMany })).rejects.toThrow(/at most 200/);
  });

  test("places and insights only see the caller's own data", async () => {
    const { t, alice, bob, aliceId, bobId } = await setup();
    const now = Date.now();
    const sam = await t.run((ctx) =>
      ctx.db.insert("people", { ownerId: aliceId, name: "Sam Lee", facts: [], lastSeenAt: now, conversationCount: 3 }),
    );
    const pings = [];
    for (let i = 0; i < 12; i++) pings.push({ ...HOME, ts: now - 50 * HOUR + i * 20 * 60 * 1000, source: "foreground" as const, placeName: "Home" });
    for (let i = 0; i < 3; i++) pings.push({ ...CAFE, ts: now - 20 * HOUR + i * 10 * 60 * 1000, source: "foreground" as const, placeName: "Blue Bottle" });
    await alice.mutation(api.places.record, { pings });
    for (const day of [1, 2, 3]) {
      await conversation(t, aliceId, { startedAt: now - day * 24 * HOUR, participantIds: [sam], at: { lat: CAFE.lat + 0.0003, lng: CAFE.lng }, placeName: "Blue Bottle" });
    }
    await conversation(t, bobId, { startedAt: now - HOUR, at: HOME, placeName: "Bob's place" });
    await bob.mutation(api.places.record, { pings: [{ ...HOME, ts: now, source: "foreground", placeName: "Bob's place" }] });

    const week = await alice.query(api.places.week, { now });
    expect(week.places.map((p) => p.name)).toEqual(["Home", "Blue Bottle"]);
    expect(week.places[0].minutes).toBe(220);
    const cafe = week.places[1];
    expect(cafe.conversationCount).toBe(3);
    expect(cafe.people).toEqual([{ _id: sam, name: "Sam Lee", count: 3 }]);
    expect(await alice.query(api.places.insights, { now })).toEqual([
      "You talked to Sam at Blue Bottle 3 times this week.",
      "You spent about 4 hours at Home this week, more than anywhere else.",
    ]);

    const bobWeek = await bob.query(api.places.week, { now });
    expect(bobWeek.places.map((p) => p.name)).toEqual(["Bob's place"]);
    expect(bobWeek.places[0].people).toEqual([]);
    expect(await bob.query(api.places.insights, { now })).toEqual([]);
  });

  test("deleting history only removes the caller's pings and conversation tags", async () => {
    vi.useFakeTimers();
    try {
      const { t, alice, bob, aliceId, bobId } = await setup();
      const now = Date.now();
      await alice.mutation(api.places.record, { pings: [{ ...CAFE, ts: now, source: "foreground" }] });
      await bob.mutation(api.places.record, { pings: [{ ...HOME, ts: now, source: "foreground" }] });
      const mine = await conversation(t, aliceId, { startedAt: now, at: CAFE, placeName: "Blue Bottle" });
      const theirs = await conversation(t, bobId, { startedAt: now, at: HOME, placeName: "Home" });

      await alice.mutation(api.places.deleteHistory, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect(await alice.query(api.places.status, {})).toEqual({ ownerId: aliceId, lastPingAt: null });
      expect(await bob.query(api.places.status, {})).toEqual({ ownerId: bobId, lastPingAt: now });
      const [a, b] = await t.run(async (ctx) => [await ctx.db.get("conversations", mine), await ctx.db.get("conversations", theirs)]);
      expect(a?.location).toBeUndefined();
      expect(a?.placeName).toBeUndefined();
      expect(a?.gist).toEqual(["Talked about the move"]);
      expect(b?.location).toEqual(HOME);
    } finally {
      vi.useRealTimers();
    }
  });
});
