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
  v.literal("goal"),
  v.literal("concern"),
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

export const eventSource = v.union(
  v.literal("calendar"),
  v.literal("imessage"),
  v.literal("email"),
  v.literal("contacts"),
  v.literal("conversation"),
);

export const connectionMode = v.union(v.literal("live"), v.literal("sample"), v.literal("off"));

export const mcpScope = v.union(v.literal("read:memory"), v.literal("write:notes"));

export const geoPoint = v.object({
  lat: v.number(),
  lng: v.number(),
  accuracy: v.optional(v.number()),
});

export const pingSource = v.union(v.literal("foreground"), v.literal("background"), v.literal("conversation"));

export const relationship = v.union(v.literal("work"), v.literal("friend"), v.literal("family"), v.literal("other"));

export const energy = v.union(v.literal("low"), v.literal("medium"), v.literal("high"));

export const activityType = v.union(
  v.literal("building"),
  v.literal("meeting"),
  v.literal("meal"),
  v.literal("social"),
  v.literal("exercise"),
  v.literal("outdoors"),
  v.literal("commute"),
  v.literal("errand"),
  v.literal("other"),
);

export const conversationChannel = v.union(v.literal("voice"), v.literal("imessage"), v.literal("email"), v.literal("call"));

export const topicMix = v.object({ work: v.number(), personal: v.number(), logistics: v.number() });

export const personSignal = v.object({
  personId: v.id("people"),
  fun: v.number(),
  overlap: v.number(),
  depth: v.number(),
});

export const sourced = v.object({
  text: v.string(),
  conversationIds: v.array(v.id("conversations")),
});

export const promise = v.object({
  text: v.string(),
  direction: v.union(v.literal("you_owe"), v.literal("they_owe")),
  conversationIds: v.array(v.id("conversations")),
  itemId: v.optional(v.id("items")),
});

export const traitKind = v.union(v.literal("interest"), v.literal("goal"), v.literal("personality"));

export const traitSource = v.union(v.literal("learned"), v.literal("told"));

export const moodFact = v.object({
  kind: v.union(v.literal("high"), v.literal("low"), v.literal("steady")),
  conversationId: v.id("conversations"),
  at: v.number(),
  mood: v.number(),
  personIds: v.array(v.id("people")),
  place: v.optional(v.string()),
  title: v.string(),
  reason: v.string(),
});

export const peopleFact = v.object({
  personId: v.id("people"),
  minutes: v.number(),
  mood: v.number(),
  conversationIds: v.array(v.id("conversations")),
  reason: v.string(),
});

export const activityFact = v.object({
  place: v.string(),
  activityType,
  minutes: v.number(),
  conversationIds: v.array(v.id("conversations")),
  reason: v.string(),
});

export const daySection = {
  score: v.number(),
  usual: v.optional(v.number()),
  desc: v.string(),
};

export const dayMood = v.object({
  ...daySection,
  curve: v.array(v.object({ at: v.number(), value: v.number(), conversationId: v.id("conversations") })),
  facts: v.array(moodFact),
});

export const dayPeople = v.object({
  ...daySection,
  totalMinutes: v.number(),
  personCount: v.number(),
  split: v.object({ work: v.number(), friend: v.number(), family: v.number(), other: v.number() }),
  facts: v.array(peopleFact),
  nudgePersonId: v.optional(v.id("people")),
  nudgeReason: v.optional(v.string()),
});

export const dayActivity = v.object({
  ...daySection,
  timeSplit: v.array(v.object({ activityType, minutes: v.number() })),
  talkSplit: topicMix,
  facts: v.array(activityFact),
});

export const dayRating = v.object({
  verdict: v.union(v.literal("up"), v.literal("down")),
  direction: v.optional(v.union(v.literal("better"), v.literal("worse"))),
  at: v.number(),
});

export const liftKind = v.union(v.literal("person"), v.literal("place"), v.literal("activityType"));

export const lift = v.object({
  kind: liftKind,
  key: v.string(),
  label: v.string(),
  personId: v.optional(v.id("people")),
  delta: v.number(),
  withAvg: v.number(),
  withoutAvg: v.number(),
  withDays: v.array(v.string()),
  note: v.string(),
});

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
    relationship: v.optional(relationship),
    roleLabel: v.optional(v.string()),
    from: v.optional(sourced),
    workingOn: v.optional(sourced),
    interests: v.optional(v.array(sourced)),
    whatMatters: v.optional(v.array(sourced)),
    relationshipSummary: v.optional(v.string()),
    totalMinutes: v.optional(v.number()),
    lastInteractionAt: v.optional(v.number()),
    encounterCount: v.optional(v.number()),
    distinctTopicCount: v.optional(v.number()),
    topicLabels: v.optional(v.array(v.string())),
    birthday: v.optional(sourced),
    howWeMet: v.optional(sourced),
    family: v.optional(v.array(sourced)),
    lifeEvents: v.optional(v.array(sourced)),
    openPromises: v.optional(v.array(promise)),
    giftIdeas: v.optional(v.array(sourced)),
    funScore: v.optional(v.number()),
    compatibilityScore: v.optional(v.number()),
    deepTalkScore: v.optional(v.number()),
    phones: v.optional(v.array(v.string())),
    emails: v.optional(v.array(v.string())),
    avatarKey: v.optional(v.string()),
    photoStorageId: v.optional(v.id("_storage")),
    contactSource: v.optional(v.union(v.literal("apple"), v.literal("demo"))),
    lastSyncedAt: v.optional(v.number()),
  })
    .index("by_ownerId", ["ownerId"])
    .index("by_ownerId_and_lastSeenAt", ["ownerId", "lastSeenAt"])
    .index("by_ownerId_and_name", ["ownerId", "name"])
    .index("by_ownerId_and_lastInteractionAt", ["ownerId", "lastInteractionAt"])
    .index("by_ownerId_and_totalMinutes", ["ownerId", "totalMinutes"])
    .index("by_ownerId_and_distinctTopicCount", ["ownerId", "distinctTopicCount"])
    .index("by_ownerId_and_funScore", ["ownerId", "funScore"])
    .index("by_ownerId_and_compatibilityScore", ["ownerId", "compatibilityScore"])
    .index("by_ownerId_and_deepTalkScore", ["ownerId", "deepTalkScore"]),

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
    location: v.optional(geoPoint),
    placeName: v.optional(v.string()),
    channel: v.optional(conversationChannel),
    mood: v.optional(v.number()),
    moodReason: v.optional(v.string()),
    energy: v.optional(energy),
    activityType: v.optional(activityType),
    topicMix: v.optional(topicMix),
    summaryLine: v.optional(v.string()),
    personSignals: v.optional(v.array(personSignal)),
  })
    .index("by_ownerId_and_startedAt", ["ownerId", "startedAt"])
    .index("by_ownerId_and_status", ["ownerId", "status"]),

  locationPings: defineTable({
    ownerId: v.id("users"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    ts: v.number(),
    placeName: v.optional(v.string()),
    source: pingSource,
  }).index("by_ownerId_and_ts", ["ownerId", "ts"]),

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
    checkIn: v.optional(
      v.union(v.literal("asked"), v.literal("accepted"), v.literal("snoozed"), v.literal("talked")),
    ),
    checkInAt: v.optional(v.number()),
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

  connections: defineTable({
    ownerId: v.id("users"),
    key: v.string(),
    source: eventSource,
    mode: connectionMode,
    lastSyncAt: v.optional(v.number()),
    itemCount: v.number(),
  }).index("by_ownerId_and_key", ["ownerId", "key"]),

  sourceEvents: defineTable({
    ownerId: v.id("users"),
    connectionKey: v.string(),
    source: eventSource,
    kind: v.string(),
    occurredAt: v.number(),
    hash: v.string(),
    conversationId: v.optional(v.id("conversations")),
    itemCount: v.number(),
  })
    .index("by_ownerId_and_hash", ["ownerId", "hash"])
    .index("by_ownerId_and_occurredAt", ["ownerId", "occurredAt"]),

  appSecrets: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  days: defineTable({
    ownerId: v.id("users"),
    date: v.string(),
    score: v.number(),
    usual: v.optional(v.number()),
    headline: v.optional(v.string()),
    take: v.optional(v.string()),
    mood: dayMood,
    people: dayPeople,
    activity: dayActivity,
    conversationIds: v.array(v.id("conversations")),
    dataDays: v.number(),
    computedAt: v.number(),
    writtenAt: v.optional(v.number()),
    userRating: v.optional(dayRating),
  }).index("by_ownerId_and_date", ["ownerId", "date"]),

  traits: defineTable({
    ownerId: v.id("users"),
    kind: traitKind,
    label: v.string(),
    reason: v.string(),
    source: traitSource,
    evidenceCount: v.number(),
    evidence: v.array(v.id("conversations")),
    confidence: v.number(),
    lastSeenAt: v.number(),
    toldAt: v.optional(v.number()),
    removed: v.boolean(),
  })
    .index("by_ownerId_and_kind", ["ownerId", "kind"])
    .index("by_ownerId_and_label", ["ownerId", "label"]),

  profiles: defineTable({
    ownerId: v.id("users"),
    identity: v.optional(v.string()),
    lifts: v.array(lift),
    dataDays: v.number(),
    computedAt: v.number(),
  }).index("by_ownerId", ["ownerId"]),

  mcpTokens: defineTable({
    ownerId: v.id("users"),
    label: v.string(),
    tokenHash: v.string(),
    prefix: v.string(),
    scopes: v.array(mcpScope),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_ownerId_and_revokedAt", ["ownerId", "revokedAt"])
    .index("by_tokenHash", ["tokenHash"]),
});
