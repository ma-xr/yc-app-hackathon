import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { computeLifts, type LiftDay } from "./lib/lifts";
import { clean, localDay, numbersIn, writeJson } from "./writer";

const DAY = 24 * 60 * 60 * 1000;
const LIFT_WINDOW = 30;
const MAX_DAY_ROWS = 365;
const MAX_USERS = 200;
const ACTIVE_WINDOW = 2 * DAY;
const MAX_IDENTITY_TRAITS = 12;

export const computeProfile = internalMutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const rows = await ctx.db
      .query("days")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(MAX_DAY_ROWS);
    const names = new Map<Id<"people">, string | null>();
    const days: LiftDay[] = [];
    for (const row of rows.slice(0, LIFT_WINDOW)) {
      const conversations = (await Promise.all(row.conversationIds.map((id) => ctx.db.get("conversations", id)))).filter(
        (c): c is Doc<"conversations"> => c !== null && c.ownerId === ownerId,
      );
      for (const id of new Set(conversations.flatMap((c) => c.participantIds))) {
        if (!names.has(id)) names.set(id, (await ctx.db.get("people", id))?.name ?? null);
      }
      const personIds = [...new Set(conversations.flatMap((c) => c.participantIds))];
      days.push({
        date: row.date,
        score: row.score,
        people: personIds.flatMap((personId) => (names.get(personId) ? [{ personId, name: names.get(personId)! }] : [])),
        places: [...new Set(conversations.flatMap((c) => (c.placeName ?? c.place ? [c.placeName ?? c.place!] : [])))],
        activityTypes: [...new Set(conversations.flatMap((c) => (c.activityType ? [c.activityType] : [])))],
      });
    }
    const fields = { lifts: computeLifts(days), dataDays: rows.length, computedAt: Date.now() };
    const existing = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).unique();
    if (existing) {
      await ctx.db.patch("profiles", existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("profiles", { ownerId, ...fields });
  },
});

export const identityInput = internalQuery({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const traits = await ctx.db.query("traits").withIndex("by_ownerId_and_kind", (q) => q.eq("ownerId", ownerId)).take(300);
    return traits
      .filter((t) => !t.removed)
      .sort((a, b) => b.confidence - a.confidence || b.evidenceCount - a.evidenceCount)
      .slice(0, MAX_IDENTITY_TRAITS)
      .map((t) => ({ kind: t.kind, label: t.label, evidenceCount: t.evidenceCount }));
  },
});

export const saveIdentity = internalMutation({
  args: { ownerId: v.id("users"), identity: v.string() },
  handler: async (ctx, { ownerId, identity }) => {
    const existing = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).unique();
    if (existing) await ctx.db.patch("profiles", existing._id, { identity });
    else await ctx.db.insert("profiles", { ownerId, identity, lifts: [], dataDays: 0, computedAt: Date.now() });
    return null;
  },
});

type IdentityTrait = { kind: Doc<"traits">["kind"]; label: string; evidenceCount: number };

export function fallbackIdentity(traits: IdentityTrait[]) {
  const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
  const interests = traits.filter((t) => t.kind === "interest").slice(0, 2).map((t) => lower(t.label));
  const goal = traits.find((t) => t.kind === "goal");
  const personality = traits.find((t) => t.kind === "personality");
  const parts = [
    interests.length > 0 ? `into ${interests.join(" and ")}` : null,
    goal ? `working toward ${lower(goal.label)}` : null,
    personality ? lower(personality.label) : null,
  ].filter((p) => p !== null);
  return parts.length === 0 ? null : `You're ${parts.join(", ")}.`;
}

const IDENTITY_RUBRIC = `You are Jesse, a warm companion who knows the owner from their conversations. From the traits given, write one sentence in second person, 25 words or fewer, that captures who they are right now. Use only the traits given, no numbers, no quotes, no flattery.`;

const IDENTITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["identity"],
  properties: { identity: { type: "string" } },
};

export const writeIdentity = internalAction({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }): Promise<string | null> => {
    const traits: IdentityTrait[] = await ctx.runQuery(internal.profiles.identityInput, { ownerId });
    const fallback = fallbackIdentity(traits);
    if (fallback === null) return null;
    const out = (await writeJson("jesse_identity", IDENTITY_SCHEMA, IDENTITY_RUBRIC, JSON.stringify(traits))) as { identity?: unknown } | null;
    const identity = clean(out?.identity, 25, numbersIn(JSON.stringify(traits)), 1) ?? fallback;
    await ctx.runMutation(internal.profiles.saveIdentity, { ownerId, identity });
    return identity;
  },
});

export const activeOwners = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const users = await ctx.db.query("users").take(MAX_USERS);
    const active: Id<"users">[] = [];
    for (const user of users) {
      const recent = await ctx.db
        .query("conversations")
        .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", user._id).gte("startedAt", since))
        .first();
      if (recent !== null) active.push(user._id);
    }
    return active;
  },
});

export const dayIds = internalQuery({
  args: { ownerId: v.id("users"), dates: v.array(v.string()) },
  handler: async (ctx, { ownerId, dates }) => {
    const rows = await Promise.all(
      dates.map((date) =>
        ctx.db
          .query("days")
          .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).eq("date", date))
          .unique(),
      ),
    );
    return rows.flatMap((row) => (row === null ? [] : [row._id]));
  },
});

export const nightly = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const owners: Id<"users">[] = await ctx.runQuery(internal.profiles.activeOwners, { since: now - ACTIVE_WINDOW });
    const dates = [localDay(now - DAY), localDay(now)];
    for (const ownerId of owners) {
      try {
        await ctx.runMutation(internal.days.computeAll, { ownerId });
        await ctx.runAction(internal.traits.learnTraits, { ownerId });
        await ctx.runMutation(internal.profiles.computeProfile, { ownerId });
        await ctx.runAction(internal.profiles.writeIdentity, { ownerId });
        const ids: Id<"days">[] = await ctx.runQuery(internal.profiles.dayIds, { ownerId, dates });
        for (const dayId of ids) await ctx.runAction(internal.writer.writeDay, { dayId });
      } catch (error) {
        console.warn(`Nightly insights failed for ${ownerId}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    return null;
  },
});
