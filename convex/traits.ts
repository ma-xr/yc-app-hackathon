import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import { conversationMinutes } from "./insights";
import { traitKind } from "./schema";
import { chatJson, clean, numbersIn, TIME_ZONE, writeJson } from "./writer";

const MINUTE = 60 * 1000;
const MAX_EVIDENCE = 20;
const RECENT_CONVERSATIONS = 300;
const MAX_GOAL_ITEMS = 50;
const MIN_INTEREST = 3;
const MAX_INTERESTS = 8;
const MIN_SAMPLE = 3;
const MAX_LABEL = 60;

type Kind = Doc<"traits">["kind"];
type Learned = {
  kind: Kind;
  label: string;
  reason: string;
  evidence: Id<"conversations">[];
  evidenceCount: number;
  confidence: number;
  lastSeenAt: number;
};
export type LearnedTrait = { traitId: Id<"traits">; kind: Kind; label: string; facts: string };

export function normalizeLabel(label: string) {
  const t = label.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function shortDate(ms: number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, month: "short", day: "numeric" }).format(ms);
}

function partOfDay(ms: number) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(ms));
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signed(n: number) {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r}` : `${r}`;
}

function joinNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
}

function evidenceOf(conversations: Doc<"conversations">[]) {
  const ids = [...new Set(conversations.sort((a, b) => b.startedAt - a.startedAt).map((c) => c._id))];
  return { evidence: ids.slice(0, MAX_EVIDENCE), evidenceCount: ids.length, lastSeenAt: Math.max(...conversations.map((c) => c.startedAt)) };
}

async function gather(ctx: MutationCtx, ownerId: Id<"users">): Promise<Learned[]> {
  const conversations = await ctx.db
    .query("conversations")
    .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
    .order("desc")
    .take(RECENT_CONVERSATIONS);
  const names = new Map<Id<"people">, string>();
  for (const id of new Set(conversations.flatMap((c) => c.participantIds))) {
    const p = await ctx.db.get("people", id);
    if (p !== null) names.set(id, p.name);
  }
  const learned: Learned[] = [];

  const byTopic = new Map<Id<"topics">, Doc<"conversations">[]>();
  for (const c of conversations) for (const t of c.topicIds ?? []) byTopic.set(t, [...(byTopic.get(t) ?? []), c]);
  const topTopics = [...byTopic].filter(([, cs]) => cs.length >= MIN_INTEREST).sort((a, b) => b[1].length - a[1].length);
  for (const [topicId, convs] of topTopics.slice(0, MAX_INTERESTS)) {
    const topic = await ctx.db.get("topics", topicId);
    if (topic === null) continue;
    const counts = new Map<string, number>();
    for (const c of convs) for (const p of c.participantIds) if (names.has(p)) counts.set(names.get(p)!, (counts.get(names.get(p)!) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name);
    const moods = convs.flatMap((c) => (c.mood === undefined ? [] : [c.mood]));
    const avg = moods.length > 0 ? mean(moods) : 0;
    const tone = avg >= 0.75 ? ", usually upbeat" : avg <= -0.75 ? ", often tense" : "";
    learned.push({
      kind: "interest",
      label: normalizeLabel(topic.label),
      reason: `${convs.length} conversations${top.length > 0 ? `, mostly with ${joinNames(top)}` : ""}${tone}`,
      confidence: Math.min(1, convs.length / 10),
      ...evidenceOf(convs),
    });
  }

  const goalItems = (
    await ctx.db
      .query("items")
      .withIndex("by_ownerId_and_kind", (q) => q.eq("ownerId", ownerId).eq("kind", "goal"))
      .order("desc")
      .take(MAX_GOAL_ITEMS)
  ).filter((i) => i.status !== "dismissed");
  const goals = new Map<string, Doc<"items">[]>();
  for (const item of goalItems) goals.set(normalizeLabel(item.text), [...(goals.get(normalizeLabel(item.text)) ?? []), item]);
  let goalsWithConversation = 0;
  const midConversation: Doc<"conversations">[] = [];
  for (const [label, items] of goals) {
    const convs = (await Promise.all([...new Set(items.flatMap((i) => (i.conversationId ? [i.conversationId] : [])))].map((id) => ctx.db.get("conversations", id)))).filter(
      (c): c is Doc<"conversations"> => c !== null && c.ownerId === ownerId,
    );
    const first = items.reduce((a, b) => (a._creationTime <= b._creationTime ? a : b));
    const firstConv = convs.find((c) => c._id === first.conversationId);
    if (firstConv) {
      goalsWithConversation++;
      const mid = first._creationTime >= firstConv.startedAt + 5 * MINUTE && (firstConv.endedAt === undefined || first._creationTime <= firstConv.endedAt);
      if (mid) midConversation.push(firstConv);
    }
    const people = firstConv ? firstConv.participantIds.flatMap((p) => (names.has(p) ? [names.get(p)!] : [])).slice(0, 2) : [];
    const lastSeenAt = Math.max(...items.map((i) => i._creationTime), ...convs.map((c) => c.startedAt));
    const reason =
      convs.length > 1
        ? `Came up in ${convs.length} conversations`
        : `Came up${people.length > 0 ? ` with ${joinNames(people)}` : ""} on ${shortDate(firstConv?.startedAt ?? first._creationTime)}`;
    learned.push({
      kind: "goal",
      label,
      reason,
      confidence: Math.min(1, 0.5 + 0.25 * (Math.max(convs.length, 1) - 1)),
      ...(convs.length > 0 ? evidenceOf(convs) : { evidence: [], evidenceCount: 0 }),
      lastSeenAt,
    });
  }

  const withMood = conversations.filter((c) => c.mood !== undefined);
  const oneOnOne = withMood.filter((c) => c.participantIds.length === 1);
  const group = withMood.filter((c) => c.participantIds.length >= 2);
  if (oneOnOne.length >= MIN_SAMPLE && group.length >= MIN_SAMPLE) {
    const solo = mean(oneOnOne.map((c) => c.mood!));
    const many = mean(group.map((c) => c.mood!));
    const reason = `Mood averages ${signed(solo)} one-on-one and ${signed(many)} in groups`;
    const confidence = Math.min(1, (oneOnOne.length + group.length) / 20);
    if (solo - many >= 0.5) learned.push({ kind: "personality", label: "Lights up one-on-one", reason, confidence, ...evidenceOf(oneOnOne) });
    if (many - solo >= 0.5) learned.push({ kind: "personality", label: "Energized by groups", reason, confidence, ...evidenceOf(group) });
  }

  const upbeat = withMood
    .filter((c) => c.mood! >= 1)
    .sort((a, b) => conversationMinutes(b) - conversationMinutes(a))
    .slice(0, 5);
  if (upbeat.length >= MIN_SAMPLE) {
    const parts = new Map<string, Doc<"conversations">[]>();
    for (const c of upbeat) parts.set(partOfDay(c.startedAt), [...(parts.get(partOfDay(c.startedAt)) ?? []), c]);
    const [part, convs] = [...parts].sort((a, b) => b[1].length - a[1].length)[0];
    if (convs.length / upbeat.length >= 0.6) {
      learned.push({
        kind: "personality",
        label: `At your best in the ${part}`,
        reason: `${convs.length} of your ${upbeat.length} longest upbeat conversations were in the ${part}`,
        confidence: (convs.length / upbeat.length) * Math.min(1, upbeat.length / 5),
        ...evidenceOf(convs),
      });
    }
  }

  if (goalsWithConversation >= MIN_SAMPLE && midConversation.length / goalsWithConversation >= 0.5) {
    learned.push({
      kind: "personality",
      label: "Thinks out loud",
      reason: `${midConversation.length} of your ${goalsWithConversation} goals first came up mid-conversation`,
      confidence: Math.min(1, goalsWithConversation / 10),
      ...evidenceOf(midConversation),
    });
  }
  return learned;
}

export const computeTraits = internalMutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }): Promise<LearnedTrait[]> => {
    const written: LearnedTrait[] = [];
    for (const t of await gather(ctx, ownerId)) {
      const existing = await ctx.db
        .query("traits")
        .withIndex("by_ownerId_and_label", (q) => q.eq("ownerId", ownerId).eq("label", t.label))
        .first();
      if (existing?.removed) continue;
      const counts = { evidence: t.evidence, evidenceCount: t.evidenceCount, lastSeenAt: t.lastSeenAt };
      if (existing?.source === "told") {
        await ctx.db.patch("traits", existing._id, { ...counts, confidence: Math.max(existing.confidence, t.confidence) });
        continue;
      }
      const fields = { ...counts, kind: t.kind, reason: t.reason, confidence: t.confidence };
      if (existing) await ctx.db.patch("traits", existing._id, fields);
      const traitId = existing?._id ?? (await ctx.db.insert("traits", { ownerId, label: t.label, source: "learned", removed: false, ...fields }));
      written.push({ traitId, kind: t.kind, label: t.label, facts: t.reason });
    }
    return written;
  },
});

export const saveReasons = internalMutation({
  args: { updates: v.array(v.object({ traitId: v.id("traits"), reason: v.string() })) },
  handler: async (ctx, { updates }) => {
    for (const { traitId, reason } of updates) {
      const trait = await ctx.db.get("traits", traitId);
      if (trait === null || trait.removed || trait.source !== "learned") continue;
      await ctx.db.patch("traits", traitId, { reason });
    }
    return null;
  },
});

const TRAITS_RUBRIC = `You are Jesse, a warm companion. For each trait Jesse learned about the owner, rewrite its facts as one friendly line in second person, 16 words or fewer, no quotes. Use only the numbers and names in that trait's facts; never invent or change a number. Return one reason per trait, in the same order.`;

const TRAITS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reasons"],
  properties: { reasons: { type: "array", items: { type: "string" } } },
};

export const learnTraits = internalAction({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }): Promise<number> => {
    const learned: LearnedTrait[] = await ctx.runMutation(internal.traits.computeTraits, { ownerId });
    if (learned.length === 0) return 0;
    const out = await writeJson("jesse_traits", TRAITS_SCHEMA, TRAITS_RUBRIC, JSON.stringify(learned.map(({ kind, label, facts }) => ({ kind, label, facts }))));
    const reasons = (out as { reasons?: unknown } | null)?.reasons;
    if (!Array.isArray(reasons)) return learned.length;
    const updates = learned.flatMap((t, i) => {
      const reason = clean(reasons[i], 16, numbersIn(t.facts), 1);
      return reason === null ? [] : [{ traitId: t.traitId, reason }];
    });
    if (updates.length > 0) await ctx.runMutation(internal.traits.saveReasons, { updates });
    return learned.length;
  },
});

export const tell = internalMutation({
  args: { ownerId: v.id("users"), kind: traitKind, label: v.string(), statement: v.optional(v.string()) },
  handler: async (ctx, { ownerId, kind, label }) => {
    const name = normalizeLabel(label);
    if (name.length === 0) throw new ConvexError("Label is empty");
    const now = Date.now();
    const fields = { kind, source: "told" as const, toldAt: now, lastSeenAt: now, confidence: 1, removed: false, reason: `You told Jesse on ${shortDate(now)}` };
    const existing = await ctx.db
      .query("traits")
      .withIndex("by_ownerId_and_label", (q) => q.eq("ownerId", ownerId).eq("label", name))
      .first();
    if (existing) {
      await ctx.db.patch("traits", existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("traits", { ownerId, label: name, evidence: [], evidenceCount: 0, ...fields });
  },
});

const TOLD_RUBRIC = `Decide whether the owner's message states something lasting about themselves: an interest (something they love or are into), a goal (something they are working toward), or a personality trait (how they tend to be). Return each as a short label of 1-5 words, like "Climbing", "Run a half marathon", "Morning person". Return an empty list for questions, small talk, requests, passing moods, and anything about other people. At most 3.`;

const TOLD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["traits"],
  properties: {
    traits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label"],
        properties: { kind: { type: "string", enum: ["interest", "goal", "personality"] }, label: { type: "string" } },
      },
    },
  },
};

const KINDS: readonly Kind[] = ["interest", "goal", "personality"];

export async function rememberTold(ctx: ActionCtx, ownerId: Id<"users">, text: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;
  for (const told of await detectTold(text, apiKey)) {
    await ctx.runMutation(internal.traits.tell, { ownerId, kind: told.kind, label: told.label }).catch(() => null);
  }
}

export async function detectTold(text: string, apiKey: string): Promise<{ kind: Kind; label: string }[]> {
  try {
    const out = (await chatJson(apiKey, "jesse_told", TOLD_SCHEMA, TOLD_RUBRIC, text)) as { traits?: unknown };
    if (!Array.isArray(out.traits)) return [];
    return out.traits
      .map((t) => t as { kind?: unknown; label?: unknown })
      .filter((t): t is { kind: Kind; label: string } => KINDS.includes(t.kind as Kind) && typeof t.label === "string")
      .map((t) => ({ kind: t.kind, label: normalizeLabel(t.label) }))
      .filter((t) => t.label.length > 0 && t.label.split(" ").length <= 5)
      .slice(0, 3);
  } catch {
    return [];
  }
}
