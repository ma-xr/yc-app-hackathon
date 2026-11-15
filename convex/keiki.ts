import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";

const CODE_TTL = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const KEIKI_HOST = "https://onkeiki.com";

export function normalizeHandle(handle: string): string {
  const trimmed = handle.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export const linkInfo = query({
  args: {},
  returns: v.object({
    number: v.union(v.string(), v.null()),
    joinCode: v.union(v.string(), v.null()),
    linked: v.boolean(),
    handleHint: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const number = env.KEIKI_LINE_NUMBER ?? null;
    const joinCode = env.KEIKI_JOIN_CODE ?? null;
    const ownerId = await getAuthUserId(ctx);
    if (ownerId === null) return { number, joinCode, linked: false, handleHint: null };
    const link = await ctx.db
      .query("keikiLinks")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .unique();
    const phone = link?.phone;
    return { number, joinCode, linked: phone !== undefined, handleHint: phone ? `…${phone.slice(-4)}` : null };
  },
});

export const createLinkCode = mutation({
  args: {},
  returns: v.object({ code: v.string(), text: v.string(), number: v.union(v.string(), v.null()) }),
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (ownerId === null) throw new ConvexError("Not signed in");
    const code = String(100000 + Math.floor(Math.random() * 900000));
    const codeExpiresAt = Date.now() + CODE_TTL;
    const link = await ctx.db
      .query("keikiLinks")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (link === null) {
      await ctx.db.insert("keikiLinks", { ownerId, code, codeExpiresAt });
    } else {
      await ctx.db.patch(link._id, { code, codeExpiresAt });
    }
    const joinCode = env.KEIKI_JOIN_CODE;
    const text = joinCode ? `hey jesse, link ${code} (K-${joinCode})` : `hey jesse, link ${code}`;
    return { code, text, number: env.KEIKI_LINE_NUMBER ?? null };
  },
});

export const unlink = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (ownerId === null) throw new ConvexError("Not signed in");
    const link = await ctx.db
      .query("keikiLinks")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (link !== null) await ctx.db.delete(link._id);
    return null;
  },
});

export const linkHandle = internalMutation({
  args: { code: v.string(), handle: v.string() },
  returns: v.union(v.literal("linked"), v.literal("invalid_code")),
  handler: async (ctx, { code, handle }) => {
    const phone = normalizeHandle(handle);
    const link = await ctx.db
      .query("keikiLinks")
      .withIndex("by_code", (q) => q.eq("code", code.trim()))
      .unique();
    if (link === null || (link.codeExpiresAt ?? 0) < Date.now()) return "invalid_code";
    const previous = await ctx.db
      .query("keikiLinks")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .take(10);
    for (const other of previous) {
      if (other._id !== link._id) await ctx.db.patch(other._id, { phone: undefined });
    }
    await ctx.db.patch(link._id, { phone, code: undefined, codeExpiresAt: undefined });
    return "linked";
  },
});

export const ownerForHandle = internalQuery({
  args: { handle: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { handle }) => {
    const link = await ctx.db
      .query("keikiLinks")
      .withIndex("by_phone", (q) => q.eq("phone", normalizeHandle(handle)))
      .first();
    return link?.ownerId ?? null;
  },
});

export const memory = internalQuery({
  args: { ownerId: v.id("users"), person: v.optional(v.string()) },
  returns: v.object({
    people: v.array(v.object({ name: v.string(), archetype: v.optional(v.string()), facts: v.array(v.string()), lastSeen: v.string() })),
    items: v.array(v.object({ kind: v.string(), text: v.string(), person: v.optional(v.string()), due: v.optional(v.string()) })),
  }),
  handler: async (ctx, { ownerId, person }) => {
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(200);
    const needle = person?.trim().toLowerCase();
    const matched = needle ? people.filter((p) => p.name.toLowerCase().includes(needle)) : people;
    const names = new Map<Id<"people">, string>(people.map((p) => [p._id, p.name]));
    const matchedIds = new Set(matched.map((p) => p._id));
    const items = await ctx.db
      .query("items")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "open"))
      .take(200);
    return {
      people: matched.slice(0, 10).map((p) => ({
        name: p.name,
        archetype: p.archetype,
        facts: p.facts,
        lastSeen: new Date(p.lastSeenAt).toISOString(),
      })),
      items: items
        .filter((i) => !needle || (i.personId !== undefined && matchedIds.has(i.personId)))
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 25)
        .map((i) => ({
          kind: i.kind,
          text: i.text,
          person: i.personId ? names.get(i.personId) : undefined,
          due: i.dueAt ? new Date(i.dueAt).toISOString() : undefined,
        })),
    };
  },
});

export const addReminder = internalMutation({
  args: { ownerId: v.id("users"), text: v.string(), person: v.optional(v.string()), dueAt: v.optional(v.number()) },
  returns: v.object({ saved: v.string(), person: v.union(v.string(), v.null()) }),
  handler: async (ctx, { ownerId, text, person, dueAt }) => {
    const needle = person?.trim().toLowerCase();
    const people = needle
      ? await ctx.db.query("people").withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId)).take(200)
      : [];
    const match = needle ? people.find((p) => p.name.toLowerCase().includes(needle)) : undefined;
    const itemId = await ctx.db.insert("items", {
      ownerId,
      personId: match?._id,
      kind: "you_owe",
      text: text.trim().split(/\s+/).slice(0, 12).join(" "),
      dueAt,
      importance: 4,
      status: "open",
      editedByUser: true,
    });
    await ctx.scheduler.runAfter(0, internal.followups.planForItem, { itemId });
    return { saved: text, person: match?.name ?? null };
  },
});

export const linkedHandles = internalQuery({
  args: {},
  returns: v.array(v.object({ ownerId: v.id("users"), phone: v.string() })),
  handler: async (ctx) => {
    const links = await ctx.db.query("keikiLinks").take(500);
    return links.flatMap((l) => (l.phone ? [{ ownerId: l.ownerId, phone: l.phone }] : []));
  },
});

export const handleForFollowup = internalQuery({
  args: { followupId: v.id("followups") },
  returns: v.union(
    v.null(),
    v.object({ phone: v.string(), personName: v.string(), reason: v.string(), drafts: v.array(v.string()), status: v.string() }),
  ),
  handler: async (ctx, { followupId }) => {
    const followup = await ctx.db.get(followupId);
    if (followup === null) return null;
    const link = await ctx.db
      .query("keikiLinks")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", followup.ownerId))
      .unique();
    const person = await ctx.db.get(followup.personId);
    if (!link?.phone || person === null) return null;
    return { phone: link.phone, personName: person.name, reason: followup.reason, drafts: followup.drafts, status: followup.status };
  },
});

async function sendNotice(phone: string, text: string): Promise<boolean> {
  const apiKey = env.KEIKI_API_KEY;
  const agentId = env.KEIKI_AGENT_ID;
  if (!apiKey || !agentId) return false;
  const response = await fetch(`${KEIKI_HOST}/api/v1/developer/agents/${agentId}/notice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text, phone }),
  });
  if (!response.ok) {
    console.error("keiki notice failed", response.status, (await response.text()).slice(0, 200));
    return false;
  }
  return true;
}

export const pushFollowup = internalAction({
  args: { followupId: v.id("followups") },
  returns: v.null(),
  handler: async (ctx, { followupId }) => {
    const target = await ctx.runQuery(internal.keiki.handleForFollowup, { followupId });
    if (target === null || target.status !== "suggested") return null;
    const drafts = target.drafts.map((d, i) => `${i + 1}. ${d}`).join("\n");
    await sendNotice(
      target.phone,
      [
        `Follow-up due now for ${target.personName}. Reason: ${target.reason}.`,
        drafts ? `Ready-to-send drafts, pass them on verbatim as separate lines so the user can copy one:\n${drafts}` : "",
        "Tell the user in one short text, then list the drafts.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    return null;
  },
});

export const eveningDigest = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const links = await ctx.runQuery(internal.keiki.linkedHandles, {});
    for (const { ownerId, phone } of links) {
      const due = await ctx.runQuery(internal.followups.suggestedFor, { ownerId, until: Date.now() + DAY / 2 });
      if (due.length === 0) continue;
      const lines = due
        .slice(0, 5)
        .map((f) => `- ${f.personName} (${f.reason})${f.drafts[0] ? `: "${f.drafts[0]}"` : ""}`)
        .join("\n");
      await sendNotice(
        phone,
        `Evening check-in. People worth a text tonight, each with a ready draft:\n${lines}\nSend the user one warm, short evening nudge with these, drafts quoted verbatim so they can copy them.`,
      );
    }
    return null;
  },
});
