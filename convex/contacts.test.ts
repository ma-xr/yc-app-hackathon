/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

vi.mock("@convex-dev/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@convex-dev/auth/server")>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject.split("|")[0] ?? null,
}));

const modules = import.meta.glob("./**/*.ts");
const contact = (contactId: string, name: string, phones: string[] = [], emails: string[] = []) => ({ contactId, name, phones, emails });

async function setup() {
  const t = convexTest(schema, modules);
  const [alice, bob] = await t.run(async (ctx) => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  return { t, aliceId: alice, alice: t.withIdentity({ subject: `${alice}|a` }), bob: t.withIdentity({ subject: `${bob}|b` }) };
}

describe("contacts.sync", () => {
  test("needs a signed-in user", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.contacts.sync, { source: "apple", contacts: [] })).rejects.toThrow(/Not signed in/);
    await expect(t.mutation(api.contacts.generatePhotoUploadUrl, {})).rejects.toThrow(/Not signed in/);
  });

  test("upserts by contact id, then phone, then email, then name, and stays per owner", async () => {
    const { t, aliceId, alice, bob } = await setup();
    const [sam, lena, dev] = await t.run(async (ctx) => [
      await ctx.db.insert("people", { ownerId: aliceId, name: "Sam Rivera", facts: [], lastSeenAt: 1, conversationCount: 2, phone: "+1 (415) 555-0101" }),
      await ctx.db.insert("people", { ownerId: aliceId, name: "Lena", facts: [], lastSeenAt: 1, conversationCount: 1, emails: ["lena@figma.com"] }),
      await ctx.db.insert("people", { ownerId: aliceId, name: "Dev Patel", facts: [], lastSeenAt: 1, conversationCount: 1 }),
    ]);
    const first = await alice.mutation(api.contacts.sync, {
      source: "apple",
      contacts: [
        contact("c1", "Samuel Rivera", ["415-555-0101"]),
        contact("c2", "Lena Ortiz", [], ["LENA@figma.com"]),
        { ...contact("c3", "dev patel"), birthday: { month: 3, day: 9 } },
        contact("c4", "Noah Kim", ["+1 510 555 0199"]),
      ],
    });
    expect(first).toEqual({ added: 1, updated: 3, total: 4 });
    const people = await t.run((ctx) => ctx.db.query("people").collect());
    expect(people.find((p) => p._id === sam)?.contactId).toBe("c1");
    expect(people.find((p) => p._id === lena)?.contactId).toBe("c2");
    expect(people.find((p) => p._id === dev)?.birthday?.text).toBe("March 9");
    const again = await alice.mutation(api.contacts.sync, { source: "apple", contacts: [contact("c4", "Noah K.")] });
    expect(again).toEqual({ added: 0, updated: 1, total: 4 });
    await bob.mutation(api.contacts.sync, { source: "demo", contacts: [contact("c1", "Samuel Rivera", ["415-555-0101"])] });
    expect((await bob.query(api.contacts.list, {})).map((p) => p.name)).toEqual(["Samuel Rivera"]);
    expect(await alice.query(api.contacts.list, {})).toHaveLength(4);
  });
});
