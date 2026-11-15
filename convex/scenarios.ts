import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { scenarioEvents } from "./integrations/fixtures/scenarios";
import { queueEvents } from "./integrations/ingest";

const scenarioName = v.union(v.literal("tim"), v.literal("mom"), v.literal("deck"));

export const list = query({
  args: {},
  returns: v.array(v.object({ name: scenarioName, title: v.string(), description: v.string() })),
  handler: async () =>
    (["tim", "mom", "deck"] as const).map((name) => ({
      name,
      title: scenarioEvents[name].title,
      description: scenarioEvents[name].description,
    })),
});

export const run = mutation({
  args: { name: scenarioName },
  returns: v.object({ queued: v.number(), skipped: v.number() }),
  handler: async (ctx, { name }) => {
    const ownerId = await requireUser(ctx);
    const now = Date.now();
    const { events } = scenarioEvents[name];
    return await queueEvents(
      ctx,
      ownerId,
      name === "mom" ? "imessage_inbox" : "conversation",
      events.map((e) => ({ source: e.source, kind: e.kind, occurredAt: now - e.minutesAgo * 60 * 1000, people: e.people, text: e.text })),
    );
  },
});
