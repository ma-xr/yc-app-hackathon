import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "../_generated/server";
import { findOrCreatePerson } from "../conversations";
import { extractNotes } from "../extract";
import { eventSource } from "../schema";
import { CONNECTIONS, placeFor } from "./catalog";

const TIME_ZONE = "America/Los_Angeles";
const DAY = 24 * 60 * 60 * 1000;

export const eventValidator = v.object({
  source: eventSource,
  kind: v.string(),
  occurredAt: v.number(),
  people: v.array(v.object({ name: v.string(), handle: v.optional(v.string()) })),
  text: v.string(),
});

type IngestEvent = typeof eventValidator.type;

function localDay(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function eventHash(ownerId: Id<"users">, event: IngestEvent) {
  const names = event.people.map((p) => p.name.toLowerCase()).sort().join(",");
  const body = [ownerId, event.source, event.kind, localDay(event.occurredAt), names, event.text.replace(/\s+/g, " ").trim()].join("|");
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export async function queueEvents(ctx: MutationCtx, ownerId: Id<"users">, connectionKey: string, events: IngestEvent[]) {
  let queued = 0;
  let skipped = 0;
  for (const event of events) {
    const seen = await ctx.db
      .query("sourceEvents")
      .withIndex("by_ownerId_and_hash", (q) => q.eq("ownerId", ownerId).eq("hash", eventHash(ownerId, event)))
      .first();
    if (seen !== null) {
      skipped++;
      continue;
    }
    await ctx.scheduler.runAfter(0, internal.integrations.ingest.ingest, { ownerId, connectionKey, event });
    queued++;
  }
  return { queued, skipped };
}

function sourceNote(event: IngestEvent, now: number) {
  const from = event.people.map((p) => p.name).join(", ") || "someone";
  const daysAgo = Math.floor((now - event.occurredAt) / DAY);
  const when = daysAgo <= 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`;
  switch (event.source) {
    case "conversation":
      return "A conversation the owner had. Each line starts with the speaker's name; \"You\" is the phone owner";
    case "imessage":
      if (event.kind === "text_to_jesse") {
        return `A text the owner sent to Jesse, received ${when}. The owner is writing about their own life: "I" and "me" are the owner, and the people they name are others. Keep it exactly like a conversation the owner had. The text`;
      }
      return `An iMessage to the owner from ${from}, received ${when}${event.kind === "unread_message" ? ", still unread and unanswered" : ""}. If someone close to the owner has waited more than a day for a reply, add a you_owe item to call or reply to them, written like "Call Mom back" (personName set to them, importance 4, dueAt today at 18:00, no time in the text). The message`;
    case "email":
      return `An email to the owner from ${from}, received ${when}. Requests to the owner are you_owe items attributed to the sender; scheduled meetings are plans. The email`;
    case "calendar":
      return `An event on the owner's calendar${event.people.length ? ` with ${from}` : ""}. A shared event is a plan, a solo appointment is urgent; always set dueAt. The event`;
    case "contacts":
      return "A contact card";
  }
}

export const ingest = internalAction({
  args: { ownerId: v.id("users"), connectionKey: v.string(), event: eventValidator },
  returns: v.object({ status: v.union(v.literal("duplicate"), v.literal("ingested"), v.literal("failed")), items: v.number() }),
  handler: async (ctx, { ownerId, connectionKey, event }) => {
    const hash = eventHash(ownerId, event);
    const begun = await ctx.runMutation(internal.integrations.ingest.begin, {
      ownerId,
      connectionKey,
      source: event.source,
      kind: event.kind,
      occurredAt: event.occurredAt,
      hash,
      people: event.people,
    });
    if (begun === null) return { status: "duplicate" as const, items: 0 };
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set on this deployment");
      const context = await ctx.runQuery(internal.conversations.extractionContext, { conversationId: begun.conversationId });
      const extraction = await extractNotes(event.text, context, apiKey, sourceNote(event, Date.now()));
      const planIds = await ctx.runMutation(internal.conversations.applyExtraction, { conversationId: begun.conversationId, extraction });
      for (const itemId of planIds) {
        await ctx.scheduler.runAfter(0, internal.followups.planForItem, { itemId });
      }
      const items: number = await ctx.runMutation(internal.integrations.ingest.finish, { eventId: begun.eventId });
      return { status: "ingested" as const, items };
    } catch (error) {
      console.error(`ingest failed for ${event.source}/${event.kind}: ${error instanceof Error ? error.message : "unknown error"}`);
      await ctx.runMutation(internal.integrations.ingest.fail, { eventId: begun.eventId });
      return { status: "failed" as const, items: 0 };
    }
  },
});

export const begin = internalMutation({
  args: {
    ownerId: v.id("users"),
    connectionKey: v.string(),
    source: eventSource,
    kind: v.string(),
    occurredAt: v.number(),
    hash: v.string(),
    people: v.array(v.object({ name: v.string(), handle: v.optional(v.string()) })),
  },
  handler: async (ctx, { ownerId, connectionKey, source, kind, occurredAt, hash, people }) => {
    const seen = await ctx.db
      .query("sourceEvents")
      .withIndex("by_ownerId_and_hash", (q) => q.eq("ownerId", ownerId).eq("hash", hash))
      .first();
    if (seen !== null) return null;
    const known = await ctx.db
      .query("people")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(200);
    const participantIds: Id<"people">[] = [];
    for (const named of people) {
      const person = await findOrCreatePerson(ctx, ownerId, known, named.name, occurredAt);
      const phone = named.handle?.startsWith("+") ? named.handle : undefined;
      await ctx.db.patch("people", person._id, {
        lastSeenAt: Math.max(person.lastSeenAt, occurredAt),
        conversationCount: person.conversationCount + 1,
        ...(phone && !person.phone ? { phone } : {}),
      });
      participantIds.push(person._id);
    }
    const conversationId = await ctx.db.insert("conversations", {
      ownerId,
      startedAt: occurredAt,
      endedAt: occurredAt,
      status: "processing",
      participantIds,
      place: placeFor(connectionKey, source),
      gist: [],
      leftOutCount: 0,
      pendingChunks: 1,
    });
    const eventId = await ctx.db.insert("sourceEvents", {
      ownerId,
      connectionKey,
      source,
      kind,
      occurredAt,
      hash,
      conversationId,
      itemCount: 0,
    });
    return { conversationId, eventId };
  },
});

export async function touchConnection(ctx: MutationCtx, ownerId: Id<"users">, key: string, added: number) {
  const entry = CONNECTIONS.find((c) => c.key === key);
  if (entry === undefined) return;
  const row = await ctx.db
    .query("connections")
    .withIndex("by_ownerId_and_key", (q) => q.eq("ownerId", ownerId).eq("key", key))
    .unique();
  if (row === null) {
    await ctx.db.insert("connections", { ownerId, key, source: entry.source, mode: entry.mode, lastSyncAt: Date.now(), itemCount: added });
    return;
  }
  await ctx.db.patch("connections", row._id, { lastSyncAt: Date.now(), itemCount: row.itemCount + added });
}

export const finish = internalMutation({
  args: { eventId: v.id("sourceEvents") },
  returns: v.number(),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("sourceEvents", eventId);
    if (event === null || event.conversationId === undefined) return 0;
    const conversationId = event.conversationId;
    const items = await ctx.db
      .query("items")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .take(20);
    await ctx.db.patch("sourceEvents", eventId, { itemCount: items.length });
    await touchConnection(ctx, event.ownerId, event.connectionKey, items.length);
    return items.length;
  },
});

export const fail = internalMutation({
  args: { eventId: v.id("sourceEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get("sourceEvents", eventId);
    if (event === null) return null;
    if (event.conversationId !== undefined) await ctx.db.delete("conversations", event.conversationId);
    await ctx.db.delete("sourceEvents", eventId);
    return null;
  },
});

