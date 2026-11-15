import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireOwned, requireUser } from "./lib/auth";

async function withDetails(ctx: QueryCtx, conversation: Doc<"conversations">) {
  const people = await Promise.all(conversation.participantIds.map((id) => ctx.db.get("people", id)));
  const items = await ctx.db
    .query("items")
    .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
    .take(20);
  return { ...conversation, people: people.filter((p) => p !== null), items };
}

export const today = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const ownerId = await requireUser(ctx);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId).gte("startedAt", since))
      .order("desc")
      .take(50);
    return await Promise.all(conversations.map((c) => withDetails(ctx, c)));
  },
});

export const range = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const ownerId = await requireUser(ctx);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) =>
        q.eq("ownerId", ownerId).gte("startedAt", from).lt("startedAt", to),
      )
      .order("asc")
      .take(200);
    return await Promise.all(conversations.map((c) => withDetails(ctx, c)));
  },
});

export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ownerId = await requireUser(ctx);
    const conversation = await requireOwned(ctx, "conversations", conversationId, ownerId);
    return await withDetails(ctx, conversation);
  },
});

export const start = mutation({
  args: { place: v.optional(v.string()) },
  handler: async (ctx, { place }) => {
    const ownerId = await requireUser(ctx);
    return await ctx.db.insert("conversations", {
      ownerId,
      startedAt: Date.now(),
      status: "listening",
      participantIds: [],
      place,
      gist: [],
      leftOutCount: 0,
      pendingChunks: 0,
      topicIds: [],
    });
  },
});

export const stop = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ownerId = await requireUser(ctx);
    const conversation = await requireOwned(ctx, "conversations", conversationId, ownerId);
    if (conversation.status !== "listening") return null;
    await ctx.db.patch("conversations", conversationId, {
      endedAt: Date.now(),
      status: (conversation.pendingChunks ?? 0) > 0 ? "processing" : "done",
    });
    return null;
  },
});

export const remove = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const ownerId = await requireUser(ctx);
    await requireOwned(ctx, "conversations", conversationId, ownerId);
    const items = await ctx.db
      .query("items")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .take(100);
    for (const item of items) {
      await ctx.db.delete("items", item._id);
    }
    await ctx.db.delete("conversations", conversationId);
    return null;
  },
});
