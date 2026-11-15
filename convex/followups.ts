import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireOwned, requireUser } from "./lib/auth";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const BEFORE_LEAD = 2 * HOUR;
const AFTER_LAG = 2 * HOUR;
const NUDGE_LEAD = HOUR;
const UNDATED_NUDGE_DELAY = 3 * HOUR;
const CADENCE_LOOKBACK = 14 * DAY;

type Plan = { reason: string; sendAt: number };

function plansForItem(item: Doc<"items">, personName: string, now: number): Plan[] {
  if (item.status !== "open") return [];
  if (item.kind === "you_owe") {
    const sendAt = item.dueAt !== undefined ? item.dueAt - NUDGE_LEAD : now + UNDATED_NUDGE_DELAY;
    return [{ reason: `You promised ${personName}: ${item.text}`, sendAt: Math.max(sendAt, now) }];
  }
  if (item.dueAt === undefined) return [];
  if (item.kind !== "plan" && item.kind !== "urgent" && item.kind !== "question") return [];
  const plans: Plan[] = [];
  if (item.dueAt - now > 15 * MINUTE) {
    plans.push({ reason: `Before: ${item.text}`, sendAt: Math.max(item.dueAt - BEFORE_LEAD, now) });
  }
  plans.push({ reason: `How did it go? ${item.text}`, sendAt: Math.max(item.dueAt + AFTER_LAG, now) });
  return plans;
}

async function insertFollowup(
  ctx: MutationCtx,
  fields: { ownerId: Id<"users">; personId: Id<"people">; itemId?: Id<"items">; reason: string; sendAt: number },
) {
  const now = Date.now();
  const due = fields.sendAt <= now;
  const followupId = await ctx.db.insert("followups", {
    ...fields,
    drafts: [],
    status: due ? "suggested" : "scheduled",
  });
  await ctx.scheduler.runAfter(0, internal.followups.generateDrafts, { followupId, pushWhenDone: due });
  if (!due) {
    await ctx.scheduler.runAt(fields.sendAt, internal.followups.activate, { followupId });
  }
  return followupId;
}

function isStale(existing: Doc<"followups">[], plans: Plan[], now: number): boolean {
  const unsent = existing.filter((f) => f.status === "scheduled" || f.status === "suggested");
  const handled = new Set(existing.filter((f) => f.status === "sent" || f.status === "dismissed").map((f) => f.reason));
  const expected = plans.filter((p) => !handled.has(p.reason));
  if (unsent.length !== expected.length) return true;
  return expected.some((plan) => {
    const match = unsent.find((f) => f.reason === plan.reason);
    if (match === undefined) return true;
    if (plan.sendAt <= now) return match.sendAt > now;
    return Math.abs(match.sendAt - plan.sendAt) > MINUTE;
  });
}

async function planItem(ctx: MutationCtx, item: Doc<"items">) {
  const existing = await ctx.db
    .query("followups")
    .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
    .take(10);
  for (const followup of existing) {
    if (followup.status === "scheduled" || followup.status === "suggested") {
      await ctx.db.delete(followup._id);
    }
  }
  if (item.personId === undefined) return;
  const person = await ctx.db.get(item.personId);
  if (person === null) return;
  const alreadyHandled = new Set(
    existing.filter((f) => f.status === "sent" || f.status === "dismissed").map((f) => f.reason),
  );
  for (const plan of plansForItem(item, person.name, Date.now())) {
    if (alreadyHandled.has(plan.reason)) continue;
    await insertFollowup(ctx, { ownerId: item.ownerId, personId: person._id, itemId: item._id, ...plan });
  }
}

export const planForItem = internalMutation({
  args: { itemId: v.id("items") },
  returns: v.null(),
  handler: async (ctx, { itemId }) => {
    const item = await ctx.db.get(itemId);
    if (item !== null) await planItem(ctx, item);
    return null;
  },
});

export const activate = internalMutation({
  args: { followupId: v.id("followups") },
  returns: v.null(),
  handler: async (ctx, { followupId }) => {
    const followup = await ctx.db.get(followupId);
    if (followup === null || followup.status !== "scheduled") return null;
    if (followup.sendAt > Date.now() + MINUTE) return null;
    if (followup.itemId !== undefined) {
      const item = await ctx.db.get(followup.itemId);
      if (item === null || item.status !== "open") return null;
    }
    await ctx.db.patch(followupId, { status: "suggested" });
    await ctx.scheduler.runAfter(0, internal.keiki.pushFollowup, { followupId });
    return null;
  },
});

export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const users = await ctx.db.query("users").take(200);
    for (const user of users) {
      const items = await ctx.db
        .query("items")
        .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", user._id).eq("status", "open"))
        .take(200);
      const names = new Map<Id<"people">, string>();
      for (const item of items) {
        if (item.dueAt === undefined && item.kind !== "you_owe") continue;
        if (item.personId === undefined) continue;
        if (!names.has(item.personId)) names.set(item.personId, (await ctx.db.get(item.personId))?.name ?? "");
        const personName = names.get(item.personId);
        if (!personName) continue;
        const existing = await ctx.db
          .query("followups")
          .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
          .take(10);
        if (existing.length === 0 || isStale(existing, plansForItem(item, personName, now), now)) {
          await planItem(ctx, item);
        }
      }

      const recent = await ctx.db
        .query("followups")
        .withIndex("by_ownerId_and_sendAt", (q) => q.eq("ownerId", user._id).gte("sendAt", now - CADENCE_LOOKBACK))
        .take(500);
      const nudged = new Set(recent.filter((f) => f.itemId === undefined).map((f) => f.personId));
      const people = await ctx.db
        .query("people")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
        .take(200);
      for (const person of people) {
        if (person.cadenceDays === undefined || nudged.has(person._id)) continue;
        const daysSince = Math.floor((now - person.lastSeenAt) / DAY);
        if (daysSince < person.cadenceDays) continue;
        await insertFollowup(ctx, {
          ownerId: user._id,
          personId: person._id,
          reason: `It's been a while: ${daysSince} days since you talked to ${person.name}`,
          sendAt: now,
        });
      }
    }
    return null;
  },
});

export const draftContext = internalQuery({
  args: { followupId: v.id("followups") },
  returns: v.union(
    v.null(),
    v.object({
      reason: v.string(),
      personName: v.string(),
      archetype: v.optional(v.string()),
      facts: v.array(v.string()),
      itemText: v.optional(v.string()),
      dueAt: v.optional(v.number()),
      voiceSamples: v.array(v.string()),
    }),
  ),
  handler: async (ctx, { followupId }) => {
    const followup = await ctx.db.get(followupId);
    if (followup === null) return null;
    const person = await ctx.db.get(followup.personId);
    if (person === null) return null;
    const item = followup.itemId ? await ctx.db.get(followup.itemId) : null;
    const history = await ctx.db
      .query("followups")
      .withIndex("by_ownerId_and_sendAt", (q) => q.eq("ownerId", followup.ownerId))
      .order("desc")
      .take(100);
    const voiceSamples = history
      .filter((f) => f.status === "sent" && f.drafts.length > 0)
      .slice(0, 5)
      .map((f) => f.drafts[0]);
    return {
      reason: followup.reason,
      personName: person.name,
      archetype: person.archetype,
      facts: person.facts.slice(0, 6),
      itemText: item?.text,
      dueAt: item?.dueAt,
      voiceSamples,
    };
  },
});

export const saveDrafts = internalMutation({
  args: { followupId: v.id("followups"), drafts: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { followupId, drafts }) => {
    const followup = await ctx.db.get(followupId);
    if (followup === null || followup.status === "sent" || followup.status === "dismissed") return null;
    await ctx.db.patch(followupId, { drafts: drafts.slice(0, 3) });
    return null;
  },
});

function fallbackDrafts(reason: string, personName: string, itemText?: string): string[] {
  const first = personName.split(" ")[0];
  if (reason.startsWith("Before:")) {
    if (/interview|exam|midterm|final|test|race|game|pitch|presentation|audition|date/i.test(itemText ?? "")) {
      return [`Good luck today, ${first}! You've got this`, `Thinking of you today ${first}, go crush it`];
    }
    return [`Looking forward to it, ${first}!`, `See you soon ${first}!`];
  }
  if (reason.startsWith("How did it go?")) {
    return [`Hey ${first}, how did it go?`, `So?? How did ${itemText ?? "it"} go?`];
  }
  if (reason.startsWith("You promised")) {
    return [`Hey ${first}, haven't forgotten, on it!`];
  }
  return [`Hey ${first}! It's been a while, how are you?`, `Thought of you today ${first}, want to catch up this week?`];
}

type DraftContext = {
  reason: string;
  personName: string;
  archetype?: string;
  facts: string[];
  itemText?: string;
  dueAt?: number;
  voiceSamples: string[];
};

export const generateDrafts = internalAction({
  args: { followupId: v.id("followups"), pushWhenDone: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { followupId, pushWhenDone }) => {
    const context: DraftContext | null = await ctx.runQuery(internal.followups.draftContext, { followupId });
    if (context === null) return null;
    let drafts = fallbackDrafts(context.reason, context.personName, context.itemText);
    const apiKey = env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        drafts = await draftWithOpenAI(apiKey, context);
      } catch (error) {
        console.error("followups.generateDrafts: OpenAI failed, using fallback", String(error));
      }
    }
    await ctx.runMutation(internal.followups.saveDrafts, { followupId, drafts });
    if (pushWhenDone) await ctx.runAction(internal.keiki.pushFollowup, { followupId });
    return null;
  },
});

async function draftWithOpenAI(apiKey: string, context: DraftContext): Promise<string[]> {
  const voice =
    context.voiceSamples.length > 0
      ? `Texts this user actually sent before (match their voice, casing, punctuation and emoji use):\n${context.voiceSamples.map((s) => `- ${s}`).join("\n")}`
      : "No past texts yet: write casually, lowercase is fine, no hashtags, at most one emoji.";
  const prompt = [
    `Write 1 to 3 short iMessage texts the user could send to ${context.personName}.`,
    `Why now: ${context.reason}`,
    context.itemText ? `Jesse's note: ${context.itemText}` : "",
    context.dueAt ? `When: ${new Date(context.dueAt).toISOString()}` : "",
    context.archetype ? `About ${context.personName}: ${context.archetype}` : "",
    context.facts.length ? `Facts: ${context.facts.join("; ")}` : "",
    voice,
    "Each text is one or two sentences, under 160 characters, warm and specific, never mentions Jesse, an app, or that anything was recorded. Each draft takes a different angle.",
  ]
    .filter(Boolean)
    .join("\n");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.OPENAI_DRAFT_MODEL ?? "gpt-5-mini",
      messages: [
        { role: "system", content: "You write short text messages in the user's own voice. Reply in JSON." },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "drafts",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { drafts: { type: "array", items: { type: "string" } } },
            required: ["drafts"],
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(body.choices[0].message.content) as { drafts: unknown };
  const drafts = Array.isArray(parsed.drafts)
    ? parsed.drafts.filter((d): d is string => typeof d === "string" && d.trim().length > 0).map((d) => d.trim())
    : [];
  if (drafts.length === 0) throw new Error("OpenAI returned no drafts");
  return drafts.slice(0, 3);
}

const followupView = v.object({
  _id: v.id("followups"),
  personId: v.id("people"),
  personName: v.string(),
  phone: v.optional(v.string()),
  itemId: v.optional(v.id("items")),
  itemText: v.optional(v.string()),
  reason: v.string(),
  sendAt: v.number(),
  drafts: v.array(v.string()),
});

export const forToday = query({
  args: { dayEnd: v.number() },
  returns: v.array(followupView),
  handler: async (ctx, { dayEnd }) => {
    const ownerId = await getAuthUserId(ctx);
    if (ownerId === null) return [];
    return await suggestedUntil(ctx, ownerId, dayEnd);
  },
});

export const suggestedFor = internalQuery({
  args: { ownerId: v.id("users"), until: v.number() },
  returns: v.array(followupView),
  handler: async (ctx, { ownerId, until }) => await suggestedUntil(ctx, ownerId, until),
});

async function suggestedUntil(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  until: number,
) {
  const rows = await ctx.db
    .query("followups")
    .withIndex("by_ownerId_and_sendAt", (q) => q.eq("ownerId", ownerId).gte("sendAt", until - 3 * DAY).lte("sendAt", until))
    .take(100);
  const open = rows.filter((f) => f.status === "suggested" || f.status === "scheduled");
  const views = [];
  for (const f of open) {
    const person = await ctx.db.get(f.personId);
    if (person === null) continue;
    const item = f.itemId ? await ctx.db.get(f.itemId) : null;
    if (item !== null && item.status !== "open") continue;
    views.push({
      _id: f._id,
      personId: f.personId,
      personName: person.name,
      phone: person.phone,
      itemId: f.itemId,
      itemText: item?.text,
      reason: f.reason,
      sendAt: f.sendAt,
      drafts: f.drafts,
    });
  }
  return views;
}

export const markSent = mutation({
  args: { id: v.id("followups"), text: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, text }) => {
    await requireOwned(ctx, "followups", id, await requireUser(ctx));
    const sent = text?.trim();
    await ctx.db.patch(id, { status: "sent", ...(sent ? { drafts: [sent] } : {}) });
    return null;
  },
});

export const dismiss = mutation({
  args: { id: v.id("followups") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireOwned(ctx, "followups", id, await requireUser(ctx));
    await ctx.db.patch(id, { status: "dismissed" });
    return null;
  },
});

export const linkCalendarEvent = mutation({
  args: { itemId: v.id("items"), calendarEventId: v.string() },
  returns: v.null(),
  handler: async (ctx, { itemId, calendarEventId }) => {
    await requireOwned(ctx, "items", itemId, await requireUser(ctx));
    await ctx.db.patch(itemId, { calendarEventId });
    return null;
  },
});
