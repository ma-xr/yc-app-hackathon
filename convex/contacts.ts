import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { moment } from "./insights";
import { requireOwned, requireUser } from "./lib/auth";

const MAX_CONTACTS = 200;
const MAX_CONVERSATIONS = 100;

export const contactSort = v.union(
  v.literal("recent"),
  v.literal("time"),
  v.literal("deepest"),
  v.literal("fun"),
  v.literal("compatibility"),
  v.literal("deepTalk"),
);

function row(p: Doc<"people">) {
  return {
    _id: p._id,
    name: p.name,
    relationship: p.relationship ?? null,
    roleLabel: p.roleLabel ?? null,
    relationshipSummary: p.relationshipSummary ?? p.archetype ?? null,
    lastInteractionAt: p.lastInteractionAt ?? p.lastSeenAt,
    totalMinutes: p.totalMinutes ?? 0,
    encounterCount: p.encounterCount ?? p.conversationCount,
    distinctTopicCount: p.distinctTopicCount ?? 0,
    funScore: p.funScore ?? null,
    compatibilityScore: p.compatibilityScore ?? null,
    deepTalkScore: p.deepTalkScore ?? null,
  };
}

export const list = query({
  args: { sort: v.optional(contactSort) },
  handler: async (ctx, { sort = "recent" }) => {
    const ownerId = await requireUser(ctx);
    const people = ctx.db.query("people");
    const ordered =
      sort === "time"
        ? people.withIndex("by_ownerId_and_totalMinutes", (q) => q.eq("ownerId", ownerId))
        : sort === "deepest"
          ? people.withIndex("by_ownerId_and_distinctTopicCount", (q) => q.eq("ownerId", ownerId))
          : sort === "fun"
            ? people.withIndex("by_ownerId_and_funScore", (q) => q.eq("ownerId", ownerId))
            : sort === "compatibility"
              ? people.withIndex("by_ownerId_and_compatibilityScore", (q) => q.eq("ownerId", ownerId))
              : sort === "deepTalk"
                ? people.withIndex("by_ownerId_and_deepTalkScore", (q) => q.eq("ownerId", ownerId))
                : people.withIndex("by_ownerId_and_lastInteractionAt", (q) => q.eq("ownerId", ownerId));
    const rows = await ordered.order("desc").take(MAX_CONTACTS);
    return rows.map(row);
  },
});

export const get = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const ownerId = await requireUser(ctx);
    const person = await requireOwned(ctx, "people", personId, ownerId);
    const recent = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(500);
    const theirs = recent.filter((c) => c.participantIds.includes(personId)).slice(0, MAX_CONVERSATIONS);
    return {
      person: { ...person, ...row(person) },
      conversations: await Promise.all(theirs.map((c) => moment(ctx, c))),
    };
  },
});
