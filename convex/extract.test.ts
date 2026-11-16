/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { Extraction } from "./conversations";
import { validateExtraction } from "./extract";
import { channelFor } from "./integrations/ingest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const MINUTE = 60 * 1000;

type Person = Extraction["people"][number];

function person(name: string, fields: Partial<Person> = {}): Person {
  return {
    name,
    archetype: null,
    facts: [],
    relationship: null,
    roleLabel: null,
    from: null,
    workingOn: null,
    birthday: null,
    howWeMet: null,
    interests: [],
    whatMatters: [],
    family: [],
    lifeEvents: [],
    giftIdeas: [],
    relationshipSummary: null,
    signal: null,
    ...fields,
  };
}

function extraction(fields: Partial<Extraction> = {}): Extraction {
  return {
    place: null,
    gist: [],
    leftOutCount: 0,
    mood: null,
    moodReason: null,
    energy: null,
    activityType: null,
    topicMix: null,
    summaryLine: null,
    people: [],
    topics: [],
    items: [],
    ...fields,
  };
}

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert("users", {}));
  return { t, ownerId };
}

async function conversation(t: ReturnType<typeof convexTest>, ownerId: Id<"users">, startedAt: number, minutes: number) {
  return await t.run((ctx) =>
    ctx.db.insert("conversations", {
      ownerId,
      startedAt,
      endedAt: startedAt + minutes * MINUTE,
      status: "processing",
      participantIds: [],
      gist: [],
      leftOutCount: 0,
      pendingChunks: 2,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validateExtraction", () => {
  test("cleans the new conversation and person labels", () => {
    const result = validateExtraction({
      mood: 7,
      moodReason: "a reason that runs on for far more than ten words in total here",
      energy: "frantic",
      activityType: "meal",
      topicMix: { work: 2, personal: 6, logistics: 0 },
      summaryLine: '"Planning the climbing trip"',
      people: [
        {
          name: "Priya",
          relationship: "friend",
          roleLabel: "Climbing buddy",
          interests: ["Bouldering", "Jazz", "Pottery", "Chess"],
          fun: 5,
          overlap: 2,
          depth: 1,
        },
        { name: "Dev", fun: 1, overlap: null, depth: 1 },
      ],
    });
    expect(result.mood).toBe(2);
    expect(result.moodReason).toBeNull();
    expect(result.energy).toBeNull();
    expect(result.activityType).toBe("meal");
    expect(result.topicMix).toEqual({ work: 0.25, personal: 0.75, logistics: 0 });
    expect(result.summaryLine).toBe("Planning the climbing trip");
    expect(result.people[0]).toMatchObject({
      relationship: "friend",
      roleLabel: "Climbing buddy",
      interests: ["Bouldering", "Jazz", "Pottery"],
      family: [],
      from: null,
      signal: { fun: 3, overlap: 2, depth: 1 },
    });
    expect(result.people[1].signal).toBeNull();
  });
});

describe("applyExtraction", () => {
  test("merges chunks and builds the person profile", async () => {
    const { t, ownerId } = await setup();
    const start = Date.parse("2026-11-15T17:00:00Z");
    const first = await conversation(t, ownerId, start, 20);
    await t.mutation(internal.conversations.applyExtraction, {
      conversationId: first,
      extraction: extraction({
        mood: 2,
        moodReason: "excited about the trip",
        energy: "high",
        activityType: "meal",
        topicMix: { work: 0.5, personal: 0.5, logistics: 0 },
        summaryLine: "Planning a climbing trip",
        topics: [{ label: "Climbing", subIdeas: [] }],
        people: [
          person("Priya", {
            relationship: "friend",
            roleLabel: "Climbing buddy",
            from: "Austin",
            interests: ["Bouldering"],
            signal: { fun: 2, overlap: 1, depth: 1 },
          }),
        ],
      }),
    });
    await t.mutation(internal.conversations.applyExtraction, {
      conversationId: first,
      extraction: extraction({
        mood: 1,
        activityType: null,
        energy: "medium",
        topicMix: { work: 0, personal: 1, logistics: 0 },
        topics: [{ label: "Work", subIdeas: [] }],
        people: [
          person("Priya", {
            relationship: "work",
            roleLabel: "Colleague",
            interests: ["bouldering", "Jazz"],
            relationshipSummary: "Old friend, climbs together on weekends",
            signal: { fun: 3, overlap: 0, depth: 2 },
          }),
        ],
        items: [{ kind: "you_owe", text: "Send Priya the trail map", personName: "Priya", topicLabel: null, dueAt: null, importance: 4 }],
      }),
    });

    const { convo, priya } = await t.run(async (ctx) => {
      const convo = (await ctx.db.get("conversations", first))!;
      const priya = (await ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).unique())!;
      return { convo, priya };
    });
    expect(convo).toMatchObject({
      mood: 1.5,
      moodReason: "excited about the trip",
      energy: "medium",
      activityType: "meal",
      topicMix: { work: 0.25, personal: 0.75, logistics: 0 },
      summaryLine: "Planning a climbing trip",
      personSignals: [{ personId: priya._id, fun: 3, overlap: 1, depth: 2 }],
      pendingChunks: 0,
      status: "done",
    });
    expect(priya).toMatchObject({
      relationship: "friend",
      roleLabel: "Climbing buddy",
      from: { text: "Austin", conversationIds: [first] },
      interests: [
        { text: "Bouldering", conversationIds: [first] },
        { text: "Jazz", conversationIds: [first] },
      ],
      relationshipSummary: "Old friend, climbs together on weekends",
      totalMinutes: 20,
      encounterCount: 1,
      lastInteractionAt: start + 20 * MINUTE,
      distinctTopicCount: 2,
      funScore: 95,
      compatibilityScore: 55,
      deepTalkScore: 60,
    });
    expect(priya.topicLabels?.sort()).toEqual(["Climbing", "Work"]);
    expect(priya.openPromises).toMatchObject([{ text: "Send Priya the trail map", direction: "you_owe", conversationIds: [first] }]);

    const second = await conversation(t, ownerId, start + 2 * 60 * MINUTE, 40);
    await t.mutation(internal.conversations.applyExtraction, {
      conversationId: second,
      extraction: extraction({ people: [person("Priya", { interests: ["Bouldering"] })] }),
    });
    const later = await t.run(async (ctx) => (await ctx.db.get("people", priya._id))!);
    expect(later).toMatchObject({
      encounterCount: 2,
      totalMinutes: 60,
      lastInteractionAt: start + 160 * MINUTE,
      interests: [
        { text: "Bouldering", conversationIds: [first, second] },
        { text: "Jazz", conversationIds: [first] },
      ],
    });
  });
});

describe("ingest", () => {
  const thread = [
    "Sam: Are we still on for the climbing gym Thursday at six? I can drive if you want.",
    "You: Yes! I'll bring the new shoes, finally broke them in at the park last weekend.",
    "Sam: Perfect. Also my sister Ana is visiting next week, want to grab dinner with us?",
    "You: Love that, let's do Friday.",
  ].join("\n");

  function stubModel() {
    const { signal: _signal, ...sam } = person("Sam", { relationship: "friend" });
    const body = {
      ...extraction({
        mood: 1,
        activityType: "social",
        topicMix: { work: 0, personal: 1, logistics: 0 },
        items: [{ kind: "fact", text: "Sam's sister Ana visits next week", personName: "Sam", topicLabel: null, dueAt: null, importance: 3 }],
      }),
      people: [{ ...sam, fun: 3, overlap: 3, depth: 1 }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }))),
    );
    process.env.OPENAI_API_KEY = "test-key";
  }

  test("channelFor skips short exchanges and texts to Jesse", () => {
    expect(channelFor({ source: "imessage", kind: "thread", text: thread })).toBe("imessage");
    expect(channelFor({ source: "email", kind: "email_received", text: "Subject: Hi\n\nCan you send the deck?" })).toBeNull();
    expect(channelFor({ source: "imessage", kind: "text_to_jesse", text: thread })).toBeNull();
    expect(channelFor({ source: "calendar", kind: "event", text: thread })).toBeNull();
    expect(channelFor({ source: "conversation", kind: "transcript", text: "You: hi" })).toBe("voice");
  });

  test("a text thread becomes an imessage conversation that counts for the contact", async () => {
    const { t, ownerId } = await setup();
    stubModel();
    const occurredAt = Date.now() - 60 * MINUTE;
    const result = await t.action(internal.integrations.ingest.ingest, {
      ownerId,
      connectionKey: "imessage_inbox",
      event: { source: "imessage", kind: "thread", occurredAt, people: [{ name: "Sam" }], text: thread },
    });
    expect(result).toEqual({ status: "ingested", items: 1 });
    const { conversations, sam } = await t.run(async (ctx) => ({
      conversations: await ctx.db.query("conversations").collect(),
      sam: (await ctx.db.query("people").withIndex("by_ownerId_and_name", (q) => q.eq("ownerId", ownerId).eq("name", "Sam")).unique())!,
    }));
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ channel: "imessage", status: "done", mood: 1, activityType: "social" });
    expect(sam).toMatchObject({ relationship: "friend", encounterCount: 1, totalMinutes: 1, lastInteractionAt: occurredAt, funScore: 90 });
  });

  test("a short message keeps its items but makes no conversation", async () => {
    const { t, ownerId } = await setup();
    stubModel();
    const result = await t.action(internal.integrations.ingest.ingest, {
      ownerId,
      connectionKey: "imessage_inbox",
      event: { source: "imessage", kind: "unread_message", occurredAt: Date.now(), people: [{ name: "Sam" }], text: "Climbing Thursday at 6?" },
    });
    expect(result).toEqual({ status: "ingested", items: 1 });
    const { conversations, items, events } = await t.run(async (ctx) => ({
      conversations: await ctx.db.query("conversations").collect(),
      items: await ctx.db.query("items").collect(),
      events: await ctx.db.query("sourceEvents").collect(),
    }));
    expect(conversations).toHaveLength(0);
    expect(items.map((i) => [i.text, i.conversationId])).toEqual([["Sam's sister Ana visits next week", undefined]]);
    expect(events.map((e) => [e.itemCount, e.conversationId])).toEqual([[1, undefined]]);
  });
});
