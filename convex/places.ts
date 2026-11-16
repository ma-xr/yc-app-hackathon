import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { requireOwned, requireUser } from "./lib/auth";
import { clusterPlaces, WEEK_MS, type Place } from "./lib/places";
import { pingSource } from "./schema";

const MAX_PINGS_PER_CALL = 200;
const MAX_PINGS_READ = 4000;
const MAX_PLACES = 12;
const MAX_CONVERSATIONS_PER_PLACE = 10;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const DELETE_BATCH = 500;

const pingInput = v.object({
  lat: v.number(),
  lng: v.number(),
  accuracy: v.optional(v.number()),
  ts: v.number(),
  placeName: v.optional(v.string()),
  source: pingSource,
});

function cleanName(name: string | undefined) {
  const trimmed = name?.replace(/\s+/g, " ").trim().slice(0, 80);
  return trimmed ? trimmed : undefined;
}

function isValid(p: typeof pingInput.type, now: number) {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    (p.accuracy === undefined || (Number.isFinite(p.accuracy) && p.accuracy >= 0)) &&
    Number.isFinite(p.ts) &&
    p.ts <= now + MAX_FUTURE_MS &&
    p.ts >= now - MAX_AGE_MS
  );
}

export const record = mutation({
  args: { pings: v.array(pingInput), conversationId: v.optional(v.id("conversations")) },
  returns: v.number(),
  handler: async (ctx, { pings, conversationId }) => {
    const ownerId = await requireUser(ctx);
    if (pings.length > MAX_PINGS_PER_CALL) {
      throw new ConvexError(`Send at most ${MAX_PINGS_PER_CALL} locations at a time`);
    }
    const conversation = conversationId ? await requireOwned(ctx, "conversations", conversationId, ownerId) : null;
    const now = Date.now();
    const valid = pings.filter((p) => isValid(p, now));
    for (const p of valid) {
      await ctx.db.insert("locationPings", {
        ownerId,
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy,
        ts: Math.min(p.ts, now),
        placeName: cleanName(p.placeName),
        source: p.source,
      });
    }
    const first = valid[0];
    if (conversation && first && conversation.location === undefined) {
      await ctx.db.patch("conversations", conversation._id, {
        location: { lat: first.lat, lng: first.lng, accuracy: first.accuracy },
        placeName: cleanName(first.placeName),
      });
    }
    return valid.length;
  },
});

export const pendingTag = query({
  args: {},
  returns: v.union(v.object({ conversationId: v.id("conversations"), startedAt: v.number() }), v.null()),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const latest = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .first();
    if (latest === null || latest.status !== "listening" || latest.location !== undefined) return null;
    return { conversationId: latest._id, startedAt: latest.startedAt };
  },
});

export const status = query({
  args: {},
  returns: v.object({ lastPingAt: v.union(v.number(), v.null()) }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const last = await ctx.db
      .query("locationPings")
      .withIndex("by_ownerId_and_ts", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .first();
    return { lastPingAt: last?.ts ?? null };
  },
});

async function weekOfPlaces(ctx: QueryCtx, ownerId: Id<"users">, now: number) {
  const since = now - WEEK_MS;
  const pings = await ctx.db
    .query("locationPings")
    .withIndex("by_ownerId_and_ts", (q) => q.eq("ownerId", ownerId).gte("ts", since))
    .order("desc")
    .take(MAX_PINGS_READ);
  const conversations = (
    await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId).gte("startedAt", since))
      .take(300)
  ).filter((c): c is Doc<"conversations"> & { location: NonNullable<Doc<"conversations">["location"]> } => c.location !== undefined);
  const byId = new Map(conversations.map((c) => [c._id, c]));
  const places = clusterPlaces(
    pings,
    conversations.map((c) => ({
      _id: c._id,
      startedAt: c.startedAt,
      lat: c.location.lat,
      lng: c.location.lng,
      placeName: c.placeName,
      participantIds: c.participantIds,
    })),
  )
    .sort((a, b) => b.minutes - a.minutes || b.conversationIds.length - a.conversationIds.length || b.lastAt - a.lastAt)
    .slice(0, MAX_PLACES);
  return { places, conversations: byId, trackedSince: pings.at(-1)?.ts ?? null };
}

async function peopleNames(ctx: QueryCtx, ownerId: Id<"users">, places: Place[]) {
  const ids = new Set(places.flatMap((p) => p.people.map((x) => x.personId)));
  const names = new Map<Id<"people">, string>();
  for (const id of ids) {
    const person = await ctx.db.get("people", id);
    if (person && person.ownerId === ownerId) names.set(id, person.name);
  }
  return names;
}

export const week = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const ownerId = await requireUser(ctx);
    const { places, conversations, trackedSince } = await weekOfPlaces(ctx, ownerId, now);
    const names = await peopleNames(ctx, ownerId, places);
    return {
      trackedSince,
      places: places.map((place) => ({
        key: place.key,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        minutes: place.minutes,
        visits: place.visits,
        firstAt: place.firstAt,
        lastAt: place.lastAt,
        people: place.people.flatMap((p) => {
          const name = names.get(p.personId);
          return name ? [{ _id: p.personId, name, count: p.count }] : [];
        }),
        conversations: place.conversationIds.slice(0, MAX_CONVERSATIONS_PER_PLACE).flatMap((id) => {
          const c = conversations.get(id);
          if (!c) return [];
          return [
            {
              _id: c._id,
              startedAt: c.startedAt,
              gist: c.gist[0] ?? null,
              people: c.participantIds.flatMap((pid) => {
                const name = names.get(pid);
                return name ? [name] : [];
              }),
            },
          ];
        }),
        conversationCount: place.conversationIds.length,
      })),
    };
  },
});

function firstName(name: string) {
  return name.split(" ")[0];
}

function times(n: number) {
  return n === 2 ? "twice" : `${n} times`;
}

export const insights = query({
  args: { now: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, { now }) => {
    const ownerId = await requireUser(ctx);
    const { places } = await weekOfPlaces(ctx, ownerId, now);
    const named = places.filter((p): p is Place & { name: string } => p.name !== null);
    const names = await peopleNames(ctx, ownerId, named);
    const lines: string[] = [];

    const pair = named
      .flatMap((place) => place.people.map((p) => ({ place, ...p })))
      .filter((p) => names.has(p.personId))
      .sort((a, b) => b.count - a.count)[0];
    if (pair && pair.count >= 2) {
      lines.push(`You talked to ${firstName(names.get(pair.personId)!)} at ${pair.place.name} ${times(pair.count)} this week.`);
    } else {
      const busiest = [...named].sort((a, b) => b.conversationIds.length - a.conversationIds.length)[0];
      if (busiest && busiest.conversationIds.length >= 2) {
        lines.push(`${busiest.conversationIds.length} of your conversations this week happened at ${busiest.name}.`);
      }
    }

    const top = named[0];
    if (top && top.minutes >= 60) {
      const hours = Math.round(top.minutes / 60);
      lines.push(`You spent about ${hours} hour${hours === 1 ? "" : "s"} at ${top.name} this week, more than anywhere else.`);
    }
    return lines;
  },
});

export const deleteHistory = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    await ctx.scheduler.runAfter(0, internal.places.purgePings, { ownerId });
    await ctx.scheduler.runAfter(0, internal.places.purgeConversationTags, {
      ownerId,
      paginationOpts: { numItems: DELETE_BATCH, cursor: null },
    });
    return null;
  },
});

export const purgePings = internalMutation({
  args: { ownerId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { ownerId }) => {
    const batch = await ctx.db
      .query("locationPings")
      .withIndex("by_ownerId_and_ts", (q) => q.eq("ownerId", ownerId))
      .take(DELETE_BATCH);
    for (const ping of batch) {
      await ctx.db.delete("locationPings", ping._id);
    }
    if (batch.length === DELETE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.places.purgePings, { ownerId });
    }
    return null;
  },
});

export const purgeConversationTags = internalMutation({
  args: { ownerId: v.id("users"), paginationOpts: paginationOptsValidator },
  returns: v.null(),
  handler: async (ctx, { ownerId, paginationOpts }) => {
    const page = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .paginate(paginationOpts);
    for (const c of page.page) {
      if (c.location !== undefined || c.placeName !== undefined) {
        await ctx.db.patch("conversations", c._id, { location: undefined, placeName: undefined });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.places.purgeConversationTags, {
        ownerId,
        paginationOpts: { numItems: paginationOpts.numItems, cursor: page.continueCursor },
      });
    }
    return null;
  },
});
