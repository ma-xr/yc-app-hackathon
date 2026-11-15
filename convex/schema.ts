import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({}),
  moments: defineTable({
    authorId: v.id("users"),
    body: v.string(),
  }).index("by_authorId", ["authorId"]),
});
