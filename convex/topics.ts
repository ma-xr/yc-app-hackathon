import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const topics = await ctx.db
      .query("topics")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(20);
    return await Promise.all(
      topics.map(async (topic) => {
        const items = await ctx.db
          .query("items")
          .withIndex("by_topicId", (q) => q.eq("topicId", topic._id))
          .order("desc")
          .take(20);
        const entries = await Promise.all(
          items.map(async (item) => ({
            item,
            person: item.personId ? await ctx.db.get("people", item.personId) : null,
            conversation: item.conversationId ? await ctx.db.get("conversations", item.conversationId) : null,
          })),
        );
        return { ...topic, entries };
      }),
    );
  },
});
