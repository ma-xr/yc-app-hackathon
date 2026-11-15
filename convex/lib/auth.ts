import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError("Not signed in");
  }
  return userId;
}

type Owned = TableNames & ("people" | "conversations" | "items" | "topics" | "followups" | "reflections");

export async function requireOwned<T extends Owned>(
  ctx: QueryCtx | MutationCtx,
  table: T,
  id: Id<T>,
  ownerId: Id<"users">,
) {
  const doc = await ctx.db.get(table, id);
  if (doc === null || doc.ownerId !== ownerId) {
    throw new ConvexError("Not found");
  }
  return doc;
}
