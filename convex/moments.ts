import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import schema from "./schema";

const MAX_BODY_LENGTH = 1000;

export const listMine = query({
  args: {},
  returns: v.array(schema.doc("moments")),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }
    return await ctx.db
      .query("moments")
      .withIndex("by_authorId", (q) => q.eq("authorId", userId))
      .order("desc")
      .take(100);
  },
});

export const add = mutation({
  args: { body: v.string() },
  returns: v.id("moments"),
  handler: async (ctx, { body }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError("Not signed in");
    }
    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_BODY_LENGTH) {
      throw new ConvexError(`A moment must be 1 to ${MAX_BODY_LENGTH} characters`);
    }
    return await ctx.db.insert("moments", { authorId: userId, body: trimmed });
  },
});
