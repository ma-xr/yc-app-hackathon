/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { addInteraction, replaceInteraction } from "./lib/contactStats";
import schema from "./schema";

vi.mock("@convex-dev/auth/server", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) => {
    const identity = await ctx.auth.getUserIdentity();
    return identity === null ? null : identity.subject.split("|")[0];
  },
}));

const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  return { t, a, b, asA: t.withIdentity({ subject: `${a}|s1` }), asB: t.withIdentity({ subject: `${b}|s2` }) };
}

const blank = { facts: [], lastSeenAt: 0, conversationCount: 0 };

function interaction(ownerId: Id<"users">, personId: Id<"people">, startedAt: number, minutes: number, depth: number, fun: number, shared: string[] = []) {
  return {
    ownerId,
    personId,
    kind: "in_person" as const,
    startedAt,
    minutes,
    title: "Talk",
    points: ["a", "b"],
    depth,
    fun,
    sharedInterests: shared,
  };
}

describe("authz", () => {
  test("another user cannot read or page someone else's person", async () => {
    const { t, a, asB } = await setup();
    const personId = await t.run((ctx) => ctx.db.insert("people", { ownerId: a, name: "Maya", ...blank }));
    await expect(asB.query(api.contacts.get, { personId })).rejects.toThrow();
    await expect(
      asB.query(api.contacts.history, { personId, paginationOpts: { numItems: 10, cursor: null } }),
    ).rejects.toThrow();
  });

  test("signed-out callers are refused", async () => {
    const { t } = await setup();
    await expect(t.query(api.contacts.list, { sort: "recent" })).rejects.toThrow();
  });

  test("list and overview only show the caller's people; sync never touches other owners", async () => {
    const { t, a, b, asA, asB } = await setup();
    const theirs = await t.run((ctx) =>
      ctx.db.insert("people", { ownerId: a, name: "Sam Lee", phones: ["+1 415 555 0100"], contactId: "x1", ...blank }),
    );
    await asB.mutation(api.contacts.sync, {
      source: "apple",
      contacts: [{ contactId: "x1", name: "Sam Lee", phones: ["4155550100"], emails: [] }],
    });
    const original = await t.run((ctx) => ctx.db.get("people", theirs));
    expect(original?.lastSyncedAt).toBeUndefined();
    expect((await asA.query(api.contacts.list, { sort: "recent" })).map((p) => p.name)).toEqual(["Sam Lee"]);
    const bList = await asB.query(api.contacts.list, { sort: "recent" });
    expect(bList).toHaveLength(1);
    expect(bList[0]._id).not.toEqual(theirs);
    expect((await asA.query(api.contacts.overview, {})).total).toBe(0);
    expect((await asB.query(api.contacts.overview, {})).total).toBe(1);
    const bPeople = await t.run((ctx) =>
      ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", b)).collect(),
    );
    expect(bPeople).toHaveLength(1);
  });
});

describe("sorts", () => {
  test("each sort key orders by its stat, people without stats last", async () => {
    const { t, a, asA } = await setup();
    const now = Date.now();
    await t.run(async (ctx) => {
      const mk = (name: string) => ctx.db.insert("people", { ownerId: a, name, ...blank });
      const ana = await mk("Ana");
      const ben = await mk("Ben");
      const cy = await mk("Cy");
      await mk("Nobody");
      await addInteraction(ctx, interaction(a, ana, now - 1 * DAY, 120, 5, 1, ["climbing", "jazz", "go", "film"]));
      await addInteraction(ctx, interaction(a, ben, now - 3 * DAY, 30, 2, 5));
      await addInteraction(ctx, interaction(a, ben, now - 2 * DAY, 30, 2, 5));
      await addInteraction(ctx, interaction(a, ben, now - 10 * DAY, 30, 2, 5));
      await addInteraction(ctx, interaction(a, cy, now - 0.1 * DAY, 10, 3, 3, ["jazz"]));
    });
    const order = async (sort: "recent" | "time" | "deepest" | "encounters" | "fun" | "compatible" | "deepTalk") =>
      (await asA.query(api.contacts.list, { sort })).map((p) => p.name);
    expect(await order("recent")).toEqual(["Cy", "Ana", "Ben", "Nobody"]);
    expect(await order("time")).toEqual(["Ana", "Ben", "Cy", "Nobody"]);
    expect(await order("deepest")).toEqual(["Ana", "Cy", "Ben", "Nobody"]);
    expect(await order("encounters")).toEqual(["Ben", "Cy", "Ana", "Nobody"]);
    expect(await order("fun")).toEqual(["Ben", "Cy", "Ana", "Nobody"]);
    expect(await order("compatible")).toEqual(["Ana", "Cy", "Ben", "Nobody"]);
    expect(await order("deepTalk")).toEqual(["Ana", "Cy", "Ben", "Nobody"]);
  });
});

describe("sync", () => {
  test("idempotent, and matches by phone, email and name", async () => {
    const { t, a, asA } = await setup();
    const contacts = [
      { contactId: "c1", name: "Priya Shah", phones: ["(415) 555-0101"], emails: ["priya@x.com"], birthday: { month: 3, day: 9 } },
      { contactId: "c2", name: "Dev Patel", phones: [], emails: [] },
    ];
    expect(await asA.mutation(api.contacts.sync, { source: "apple", contacts })).toEqual({ added: 2, updated: 0, total: 2 });
    expect(await asA.mutation(api.contacts.sync, { source: "apple", contacts })).toEqual({ added: 0, updated: 2, total: 2 });

    const [byPhone, byEmail, byName] = await t.run(async (ctx) => [
      await ctx.db.insert("people", { ownerId: a, name: "Jo", phone: "+1 650 555 0199", ...blank }),
      await ctx.db.insert("people", { ownerId: a, name: "Kim", emails: ["KIM@y.com"], ...blank }),
      await ctx.db.insert("people", { ownerId: a, name: "Lena Ortiz", ...blank }),
    ]);
    const result = await asA.mutation(api.contacts.sync, {
      source: "apple",
      contacts: [
        { contactId: "c3", name: "Joanna Smith", phones: ["650-555-0199"], emails: [] },
        { contactId: "c4", name: "Kimberly", phones: [], emails: ["kim@y.com"] },
        { contactId: "c5", name: "lena ortiz", phones: [], emails: [] },
      ],
    });
    expect(result).toEqual({ added: 0, updated: 3, total: 5 });
    const after = await t.run(async (ctx) => Promise.all([byPhone, byEmail, byName].map((id) => ctx.db.get("people", id))));
    expect(after.map((p) => p?.contactId)).toEqual(["c3", "c4", "c5"]);
    const overview = await asA.query(api.contacts.overview, {});
    expect(overview.total).toBe(5);
    expect(overview.source).toBe("apple");
  });
});

describe("stats", () => {
  test("addInteraction then replaceInteraction keeps totals right", async () => {
    const { t, a } = await setup();
    const now = Date.now();
    const person = await t.run(async (ctx) => {
      const personId = await ctx.db.insert("people", { ownerId: a, name: "Sam", ...blank });
      const first = await addInteraction(ctx, interaction(a, personId, now - DAY, 10, 4, 2));
      await addInteraction(ctx, interaction(a, personId, now - 2 * DAY, 20, 2, 4));
      const doc = (await ctx.db.get("interactions", first))!;
      await replaceInteraction(ctx, doc, { minutes: 40, depth: 4 });
      return await ctx.db.get("people", personId);
    });
    expect(person?.totalMinutes).toBe(60);
    expect(person?.encounterCount).toBe(2);
    expect(person?.lastInteractionAt).toBe(now - DAY);
    expect(person?.knownSince).toBe(now - 2 * DAY);
    expect(Math.abs((person?.depthScore ?? 0) - (40 * 4 + 20 * 2) / 60)).toBeLessThanOrEqual(0.1);
  });
});

describe("detail", () => {
  test("get resolves facts, promises and birthday; history hides short interactions", async () => {
    const { t, a, asA } = await setup();
    const now = Date.now();
    const { personId, conversationId } = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        ownerId: a, startedAt: now - DAY, status: "done", participantIds: [], gist: ["Trip planning"], leftOutCount: 0,
      });
      const personId = await ctx.db.insert("people", {
        ownerId: a, name: "Maya", ...blank, birthday: { month: 1, day: 1, year: 1990 },
        profile: [
          { kind: "interest", text: "Loves bouldering", learnedAt: now - 5 * DAY },
          { kind: "relationship", text: "College roommate", conversationId, learnedAt: now - DAY },
        ],
      });
      await addInteraction(ctx, { ...interaction(a, personId, now - DAY, 25, 4, 4), conversationId, title: "Kyoto plans" });
      await addInteraction(ctx, interaction(a, personId, now - 2 * DAY, 1, 1, 1));
      await ctx.db.insert("items", { ownerId: a, personId, kind: "you_owe", text: "Send Kyoto list", importance: 5, status: "open", editedByUser: false });
      await ctx.db.insert("items", { ownerId: a, personId, kind: "they_owe", text: "Intro to Dev", importance: 3, status: "done", editedByUser: false });
      return { personId, conversationId };
    });
    const detail = await asA.query(api.contacts.get, { personId });
    expect(detail.facts.map((f) => f.kind)).toEqual(["relationship", "interest"]);
    expect(detail.facts[0].source).toEqual({ conversationId, title: "Kyoto plans", startedAt: now - DAY });
    expect(detail.facts[1].source).toBeNull();
    expect(detail.promises.youOwe.map((p) => p.text)).toEqual(["Send Kyoto list"]);
    expect(detail.promises.theyOwe).toEqual([]);
    expect(detail.age).toBeGreaterThan(30);
    expect(detail.nextBirthdayInDays).toBeGreaterThanOrEqual(0);
    expect(detail.person.photoUrl).toBeNull();

    const page = await asA.query(api.contacts.history, { personId, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map((i) => i.title)).toEqual(["Kyoto plans"]);

    const overview = await asA.query(api.contacts.overview, {});
    expect(overview.focus[0]).toMatchObject({ _id: personId, reason: "You owe: Send Kyoto list" });

    await asA.mutation(api.people.remove, { personId });
    const left = await t.run((ctx) => ctx.db.query("interactions").collect());
    expect(left).toHaveLength(0);
  });
});
