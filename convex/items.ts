import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireOwned, requireUser } from "./lib/auth";
import { itemKind, itemStatus } from "./schema";

const MAX_ITEM_WORDS = 12;

function rank(a: Doc<"items">, b: Doc<"items">) {
  if (a.importance !== b.importance) return b.importance - a.importance;
  const aDue = a.dueAt ?? Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ?? Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return b._creationTime - a._creationTime;
}

export const open = query({
  args: {
    kinds: v.optional(v.array(itemKind)),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { kinds, limit }) => {
    const ownerId = await requireUser(ctx);
    const items = await ctx.db
      .query("items")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "open"))
      .order("desc")
      .take(300);
    const ranked = items
      .filter((item) => kinds === undefined || kinds.includes(item.kind))
      .sort(rank)
      .slice(0, limit ?? 50);
    return await Promise.all(
      ranked.map(async (item) => ({
        ...item,
        person: item.personId ? await ctx.db.get("people", item.personId) : null,
      })),
    );
  },
});

export const update = mutation({
  args: {
    itemId: v.id("items"),
    text: v.optional(v.string()),
    kind: v.optional(itemKind),
    status: v.optional(itemStatus),
    dueAt: v.optional(v.union(v.number(), v.null())),
    importance: v.optional(v.number()),
    personId: v.optional(v.id("people")),
    calendarEventId: v.optional(v.string()),
  },
  handler: async (ctx, { itemId, dueAt, ...fields }) => {
    const ownerId = await requireUser(ctx);
    await requireOwned(ctx, "items", itemId, ownerId);
    if (fields.personId !== undefined) {
      await requireOwned(ctx, "people", fields.personId, ownerId);
    }
    if (fields.text !== undefined) {
      const text = fields.text.trim();
      if (text.length === 0 || text.split(/\s+/).length > MAX_ITEM_WORDS) {
        throw new ConvexError(`A note is 1 to ${MAX_ITEM_WORDS} words`);
      }
      fields.text = text;
    }
    if (fields.importance !== undefined && (fields.importance < 1 || fields.importance > 5)) {
      throw new ConvexError("Importance is 1 to 5");
    }
    const edited = fields.text !== undefined || fields.kind !== undefined || dueAt !== undefined;
    await ctx.db.patch("items", itemId, {
      ...fields,
      ...(dueAt !== undefined ? { dueAt: dueAt ?? undefined } : {}),
      ...(edited ? { editedByUser: true } : {}),
    });
    return null;
  },
});

export const remove = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const ownerId = await requireUser(ctx);
    await requireOwned(ctx, "items", itemId, ownerId);
    await ctx.db.delete("items", itemId);
    return null;
  },
});
