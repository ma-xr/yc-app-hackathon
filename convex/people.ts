import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireOwned, requireUser } from "./lib/auth";

const MAX_FACT_WORDS = 12;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(200);
    return await Promise.all(
      people.map(async (person) => {
        const items = await ctx.db
          .query("items")
          .withIndex("by_personId", (q) => q.eq("personId", person._id))
          .order("desc")
          .take(50);
        return { ...person, openItems: items.filter((item) => item.status === "open") };
      }),
    );
  },
});

export const get = query({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const ownerId = await requireUser(ctx);
    const person = await requireOwned(ctx, "people", personId, ownerId);
    const items = await ctx.db
      .query("items")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .order("desc")
      .take(100);
    const recent = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(300);
    const conversations = recent.filter((c: Doc<"conversations">) => c.participantIds.includes(personId));
    return { person, items, conversations };
  },
});

export const update = mutation({
  args: {
    personId: v.id("people"),
    name: v.optional(v.string()),
    archetype: v.optional(v.string()),
    facts: v.optional(v.array(v.string())),
    phone: v.optional(v.string()),
    contactId: v.optional(v.string()),
  },
  handler: async (ctx, { personId, ...fields }) => {
    const ownerId = await requireUser(ctx);
    await requireOwned(ctx, "people", personId, ownerId);
    if (fields.name !== undefined && fields.name.trim().length === 0) {
      throw new ConvexError("A name can't be empty");
    }
    if (fields.facts?.some((fact) => fact.trim().split(/\s+/).length > MAX_FACT_WORDS)) {
      throw new ConvexError(`Keep each note to ${MAX_FACT_WORDS} words or fewer`);
    }
    await ctx.db.patch("people", personId, fields);
    return null;
  },
});

export const remove = mutation({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const ownerId = await requireUser(ctx);
    await requireOwned(ctx, "people", personId, ownerId);
    const items = await ctx.db
      .query("items")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .take(500);
    for (const item of items) {
      await ctx.db.delete("items", item._id);
    }
    await ctx.db.delete("people", personId);
    return null;
  },
});
