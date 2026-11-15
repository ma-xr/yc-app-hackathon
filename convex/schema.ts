import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({}),
  moments: defineTable({
    author: v.id("users"),
    text: v.string(),
  }).index("by_author", ["author"]),
});
