import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { eventSource, connectionMode } from "./schema";
import { CONNECTIONS, SAMPLE_FIXTURES } from "./integrations/catalog";
import { queueEvents, touchConnection } from "./integrations/ingest";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      source: eventSource,
      mode: connectionMode,
      detail: v.string(),
      lastSyncAt: v.union(v.number(), v.null()),
      itemCount: v.number(),
      canLoadSample: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx);
    const rows = await ctx.db
      .query("connections")
      .withIndex("by_ownerId_and_key", (q) => q.eq("ownerId", ownerId))
      .take(50);
    const link = await ctx.db
      .query("keikiLinks")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .first();
    const items = await ctx.db
      .query("items")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(500);
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(500);
    return CONNECTIONS.map((entry) => {
      const row = rows.find((r) => r.key === entry.key);
      let mode = row?.mode ?? entry.mode;
      let detail = entry.detail;
      let itemCount = row?.itemCount ?? 0;
      if (entry.key === "imessage_jesse") {
        mode = link?.phone ? "live" : "off";
        if (!link?.phone) detail = "Link your number to text Jesse";
      }
      if (entry.key === "calendar_write") itemCount = items.filter((i) => i.calendarEventId !== undefined).length;
      if (entry.key === "contacts") itemCount = people.filter((p) => p.contactId !== undefined).length;
      return {
        key: entry.key,
        label: entry.label,
        source: entry.source,
        mode,
        detail,
        lastSyncAt: row?.lastSyncAt ?? null,
        itemCount,
        canLoadSample: entry.mode === "sample" && mode !== "off",
      };
    });
  },
});

export const loadSample = mutation({
  args: { key: v.string() },
  returns: v.object({ queued: v.number(), skipped: v.number() }),
  handler: async (ctx, { key }) => {
    const ownerId = await requireUser(ctx);
    const fixtures = SAMPLE_FIXTURES[key];
    if (fixtures === undefined) throw new ConvexError("That source has no sample data");
    const now = Date.now();
    return await queueEvents(
      ctx,
      ownerId,
      key,
      fixtures.map((f) => ({ source: f.source, kind: f.kind, occurredAt: now - f.minutesAgo * 60 * 1000, people: f.people, text: f.text })),
    );
  },
});

export const importContacts = mutation({
  args: {
    contacts: v.array(v.object({ contactId: v.string(), name: v.string(), phone: v.optional(v.string()) })),
  },
  returns: v.object({ added: v.number(), updated: v.number() }),
  handler: async (ctx, { contacts }) => {
    const ownerId = await requireUser(ctx);
    if (contacts.length > 100) throw new ConvexError("Send contacts in batches of 100");
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(1000);
    let added = 0;
    let updated = 0;
    for (const contact of contacts) {
      const name = contact.name.trim().slice(0, 80);
      if (!name) continue;
      const phone = contact.phone?.replace(/[^\d+]/g, "") || undefined;
      const match =
        people.find((p) => p.contactId === contact.contactId) ??
        people.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (match) {
        await ctx.db.patch("people", match._id, { contactId: contact.contactId, ...(phone && !match.phone ? { phone } : {}) });
        updated++;
        continue;
      }
      const id = await ctx.db.insert("people", { ownerId, name, contactId: contact.contactId, phone, facts: [], lastSeenAt: 0, conversationCount: 0 });
      people.push((await ctx.db.get("people", id))!);
      added++;
    }
    await touchConnection(ctx, ownerId, "contacts", 0);
    return { added, updated };
  },
});
