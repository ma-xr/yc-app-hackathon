import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const conversationStatus = v.union(
  v.literal("listening"),
  v.literal("processing"),
  v.literal("done"),
);

export const itemKind = v.union(
  v.literal("you_owe"),
  v.literal("they_owe"),
  v.literal("plan"),
  v.literal("urgent"),
  v.literal("fact"),
  v.literal("question"),
  v.literal("takeaway"),
);

export const itemStatus = v.union(
  v.literal("open"),
  v.literal("done"),
  v.literal("dismissed"),
);

export const followupStatus = v.union(
  v.literal("suggested"),
  v.literal("scheduled"),
  v.literal("sent"),
  v.literal("dismissed"),
);

export default defineSchema({
  users: defineTable({}),

  people: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    contactId: v.optional(v.string()),
    phone: v.optional(v.string()),
    archetype: v.optional(v.string()),
    facts: v.array(v.string()),
    lastSeenAt: v.number(),
    conversationCount: v.number(),
    cadenceDays: v.optional(v.number()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_lastSeenAt", ["ownerId", "lastSeenAt"])
    .index("by_ownerId_and_name", ["ownerId", "name"]),

  conversations: defineTable({
    ownerId: v.id("users"),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    status: conversationStatus,
    participantIds: v.array(v.id("people")),
    place: v.optional(v.string()),
    gist: v.array(v.string()),
    leftOutCount: v.number(),
    pendingChunks: v.optional(v.number()),
    topicIds: v.optional(v.array(v.id("topics"))),
  })
    .index("by_ownerId_and_startedAt", ["ownerId", "startedAt"])
    .index("by_ownerId_and_status", ["ownerId", "status"]),

  items: defineTable({
    ownerId: v.id("users"),
    conversationId: v.optional(v.id("conversations")),
    personId: v.optional(v.id("people")),
    topicId: v.optional(v.id("topics")),
    kind: itemKind,
    text: v.string(),
    dueAt: v.optional(v.number()),
    importance: v.number(),
    status: itemStatus,
    editedByUser: v.boolean(),
    calendarEventId: v.optional(v.string()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_ownerId_and_kind", ["ownerId", "kind"])
    .index("by_conversationId", ["conversationId"])
    .index("by_personId", ["personId"])
    .index("by_topicId", ["topicId"]),

  topics: defineTable({
    ownerId: v.id("users"),
    label: v.string(),
    subIdeas: v.array(v.string()),
    conversationCount: v.number(),
    peopleCount: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_lastSeenAt", ["ownerId", "lastSeenAt"])
    .index("by_ownerId_and_label", ["ownerId", "label"]),

  followups: defineTable({
    ownerId: v.id("users"),
    personId: v.id("people"),
    itemId: v.optional(v.id("items")),
    reason: v.string(),
    sendAt: v.number(),
    drafts: v.array(v.string()),
    status: followupStatus,
  })
    .index("by_ownerId_and_sendAt", ["ownerId", "sendAt"])
    .index("by_ownerId_and_status", ["ownerId", "status"])
    .index("by_itemId", ["itemId"])
    .index("by_personId", ["personId"]),

  reflections: defineTable({
    ownerId: v.id("users"),
    date: v.string(),
    topicId: v.optional(v.id("topics")),
    question: v.string(),
    messages: v.array(
      v.object({
        role: v.union(v.literal("jesse"), v.literal("user")),
        text: v.string(),
      }),
    ),
  }).index("by_ownerId_and_date", ["ownerId", "date"]),

  keikiLinks: defineTable({
    ownerId: v.id("users"),
    phone: v.optional(v.string()),
    code: v.optional(v.string()),
    codeExpiresAt: v.optional(v.number()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_phone", ["phone"])
    .index("by_code", ["code"]),
});
