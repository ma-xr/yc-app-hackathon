import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { moment } from "./insights";

const OPENAI = "https://api.openai.com/v1";
const WRITER_MODEL = process.env.OPENAI_WRITER_MODEL ?? "gpt-5-mini";
export const TIME_ZONE = "America/Los_Angeles";

export function localDay(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

export function localTime(ms: number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(ms);
}

export function numbersIn(text: string) {
  return new Set(text.match(/\d+(?:\.\d+)?/g) ?? []);
}

export function clean(text: unknown, maxWords: number, allowed: Set<string>, maxSentences = 1) {
  if (typeof text !== "string") return null;
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length === 0 || /["\u201c\u201d]/.test(text)) return null;
  if (t.split(" ").length > maxWords) return null;
  if ((t.match(/[.!?](\s|$)/g) ?? []).length > maxSentences) return null;
  if (![...numbersIn(t)].every((n) => allowed.has(n))) return null;
  return t;
}

export async function chatJson(apiKey: string, name: string, schema: object, system: string, user: string): Promise<unknown> {
  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: WRITER_MODEL,
      ...(WRITER_MODEL.startsWith("gpt-5") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`Writer failed with HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Writer returned no content");
  return JSON.parse(content);
}

export async function writeJson(name: string, schema: object, system: string, user: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    return await chatJson(apiKey, name, schema, system, user);
  } catch (error) {
    console.warn(`${name} writer kept fallback text: ${error instanceof Error ? error.message : "unknown error"}`);
    return null;
  }
}

const DAY_RUBRIC = `You are Jesse, a warm, perceptive companion writing the owner's daily insights from labels Jesse kept about their conversations. Write in second person ("you"), plain and kind, never clinical and never gushing.

Every number is already computed and given to you. Use only those numbers: never calculate, round, estimate or invent a number, and never mention a number that is not in the input. Never quote anyone or invent details beyond the labels given. Scores run 0-100 and "usual" is the owner's typical score; mood values run -2 (low) to 2 (high); talkSplit is in percent.

Write:
- headline: 12 words or fewer, no period needed.
- take: exactly 2 sentences, the gist of the day.
- moodDesc, peopleDesc, activityDesc: 2-3 sentences each about that section.
- moodFacts: one entry per input mood fact, same order. title: 6 words or fewer. reason: one line, 20 words or fewer.
- peopleReasons: one line per input people fact, same order, 20 words or fewer.
- activityReasons: one line per input activity fact, same order, 20 words or fewer.
- nudgeReason: one line on why reaching out to the nudge person would be good, or null when there is no nudge.
- Never restate scores, minute counts or calendar dates: the app shows the numbers. Say "a long stretch", "most of the day", "almost two weeks" instead.`;

const nullableString = { type: ["string", "null"] };
const DAY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "take", "moodDesc", "peopleDesc", "activityDesc", "nudgeReason", "moodFacts", "peopleReasons", "activityReasons"],
  properties: {
    headline: { type: "string" },
    take: { type: "string" },
    moodDesc: { type: "string" },
    peopleDesc: { type: "string" },
    activityDesc: { type: "string" },
    nudgeReason: nullableString,
    moodFacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason"],
        properties: { title: { type: "string" }, reason: { type: "string" } },
      },
    },
    peopleReasons: { type: "array", items: { type: "string" } },
    activityReasons: { type: "array", items: { type: "string" } },
  },
};

const percent = (n: number) => Math.round(n * 100);

async function buildDayInput(ctx: QueryCtx, day: Doc<"days">) {
  const conversations = (await Promise.all(day.conversationIds.map((id) => ctx.db.get("conversations", id)))).filter(
    (c): c is Doc<"conversations"> => c !== null && c.ownerId === day.ownerId,
  );
  const moments = (await Promise.all(conversations.map((c) => moment(ctx, c)))).sort((a, b) => a.startedAt - b.startedAt);
  const person = async (id: Id<"people">) => {
    const p = await ctx.db.get("people", id);
    return p === null ? null : { name: p.name, roleLabel: p.roleLabel ?? null, lastTalked: localDay(p.lastInteractionAt ?? p.lastSeenAt) };
  };
  return {
    conversationIds: day.conversationIds,
    input: {
      date: day.date,
      score: day.score,
      usual: day.usual ?? null,
      mood: {
        score: day.mood.score,
        usual: day.mood.usual ?? null,
        facts: await Promise.all(
          day.mood.facts.map(async (f) => ({
            kind: f.kind,
            time: localTime(f.at),
            mood: f.mood,
            place: f.place ?? null,
            people: (await Promise.all(f.personIds.map(person))).filter((p) => p !== null).map((p) => p.name),
            title: f.title,
          })),
        ),
      },
      people: {
        score: day.people.score,
        usual: day.people.usual ?? null,
        totalMinutes: day.people.totalMinutes,
        personCount: day.people.personCount,
        minutesByRelationship: day.people.split,
        facts: await Promise.all(
          day.people.facts.map(async (f) => ({ person: await person(f.personId), minutes: f.minutes, mood: f.mood })),
        ),
        nudge: day.people.nudgePersonId ? await person(day.people.nudgePersonId) : null,
      },
      activity: {
        score: day.activity.score,
        usual: day.activity.usual ?? null,
        minutesByActivity: day.activity.timeSplit,
        talkSplit: {
          work: percent(day.activity.talkSplit.work),
          personal: percent(day.activity.talkSplit.personal),
          logistics: percent(day.activity.talkSplit.logistics),
        },
        facts: day.activity.facts.map((f) => ({ place: f.place, activityType: f.activityType, minutes: f.minutes })),
      },
      conversations: moments.map((m) => ({
        time: localTime(m.startedAt),
        minutes: m.minutes,
        place: m.place,
        channel: m.channel,
        people: m.people.map((p) => ({ name: p.name, roleLabel: p.roleLabel })),
        topics: m.topics,
        mood: m.mood,
        moodReason: m.moodReason,
        activityType: m.activityType,
        summaryLine: m.summaryLine,
      })),
    },
  };
}

type DayInput = Awaited<ReturnType<typeof buildDayInput>>;

export const dayInput = internalQuery({
  args: { dayId: v.id("days") },
  handler: async (ctx, { dayId }) => {
    const day = await ctx.db.get("days", dayId);
    return day === null ? null : await buildDayInput(ctx, day);
  },
});

const nullable = v.union(v.string(), v.null());
const dayWordsValidator = v.object({
  headline: nullable,
  take: nullable,
  moodDesc: nullable,
  peopleDesc: nullable,
  activityDesc: nullable,
  nudgeReason: nullable,
  moodFacts: v.array(v.object({ title: nullable, reason: nullable })),
  peopleReasons: v.array(nullable),
  activityReasons: v.array(nullable),
});

function dayWords(out: unknown, input: DayInput["input"]) {
  const o = (out ?? {}) as Record<string, unknown>;
  const allowed = numbersIn(JSON.stringify(input));
  const list = (key: string) => (Array.isArray(o[key]) ? (o[key] as unknown[]) : []);
  const desc = (text: unknown) => clean(text, 70, allowed, 3);
  const reason = (text: unknown) => clean(text, 20, allowed, 1);
  return {
    headline: clean(o.headline, 12, allowed, 1),
    take: clean(o.take, 50, allowed, 2),
    moodDesc: desc(o.moodDesc),
    peopleDesc: desc(o.peopleDesc),
    activityDesc: desc(o.activityDesc),
    nudgeReason: input.people.nudge ? clean(o.nudgeReason, 25, allowed, 1) : null,
    moodFacts: input.mood.facts.map((_, i) => {
      const f = (list("moodFacts")[i] ?? {}) as { title?: unknown; reason?: unknown };
      return { title: clean(f.title, 6, allowed, 1), reason: reason(f.reason) };
    }),
    peopleReasons: input.people.facts.map((_, i) => reason(list("peopleReasons")[i])),
    activityReasons: input.activity.facts.map((_, i) => reason(list("activityReasons")[i])),
  };
}

export const applyDay = internalMutation({
  args: { dayId: v.id("days"), conversationIds: v.array(v.id("conversations")), words: dayWordsValidator },
  handler: async (ctx, { dayId, conversationIds, words }) => {
    const day = await ctx.db.get("days", dayId);
    if (day === null || day.conversationIds.join() !== conversationIds.join()) return false;
    if (
      words.moodFacts.length !== day.mood.facts.length ||
      words.peopleReasons.length !== day.people.facts.length ||
      words.activityReasons.length !== day.activity.facts.length
    ) {
      return false;
    }
    await ctx.db.patch("days", dayId, {
      headline: words.headline ?? day.headline,
      take: words.take ?? day.take,
      mood: {
        ...day.mood,
        desc: words.moodDesc ?? day.mood.desc,
        facts: day.mood.facts.map((f, i) => ({
          ...f,
          title: words.moodFacts[i].title ?? f.title,
          reason: words.moodFacts[i].reason ?? f.reason,
        })),
      },
      people: {
        ...day.people,
        desc: words.peopleDesc ?? day.people.desc,
        nudgeReason: words.nudgeReason ?? day.people.nudgeReason,
        facts: day.people.facts.map((f, i) => ({ ...f, reason: words.peopleReasons[i] ?? f.reason })),
      },
      activity: {
        ...day.activity,
        desc: words.activityDesc ?? day.activity.desc,
        facts: day.activity.facts.map((f, i) => ({ ...f, reason: words.activityReasons[i] ?? f.reason })),
      },
      writtenAt: Date.now(),
    });
    return true;
  },
});

export const writeDay = internalAction({
  args: { dayId: v.id("days") },
  handler: async (ctx, { dayId }): Promise<boolean> => {
    const data: DayInput | null = await ctx.runQuery(internal.writer.dayInput, { dayId });
    if (data === null || data.conversationIds.length === 0) return false;
    const out = await writeJson("jesse_day", DAY_SCHEMA, DAY_RUBRIC, JSON.stringify(data.input));
    if (out === null) return false;
    const applied: boolean = await ctx.runMutation(internal.writer.applyDay, {
      dayId,
      conversationIds: data.conversationIds,
      words: dayWords(out, data.input),
    });
    return applied;
  },
});
