import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";

const DEFAULT_MODEL = "gpt-5-mini";
const MAX_QUESTION_LENGTH = 500;
const MAX_REPLY_WORDS = 45;
const SPOKEN_AUDIO_TTL_MS = 10 * 60 * 1000;

const memoryValidator = v.object({
  people: v.array(
    v.object({
      id: v.id("people"),
      name: v.string(),
      archetype: v.union(v.string(), v.null()),
      facts: v.array(v.string()),
      lastSeenAt: v.number(),
      conversationCount: v.number(),
    }),
  ),
  items: v.array(
    v.object({
      kind: v.string(),
      text: v.string(),
      person: v.union(v.string(), v.null()),
      dueAt: v.union(v.number(), v.null()),
      importance: v.number(),
    }),
  ),
  topics: v.array(
    v.object({
      label: v.string(),
      subIdeas: v.array(v.string()),
      conversationCount: v.number(),
      peopleCount: v.number(),
    }),
  ),
  conversations: v.array(
    v.object({
      id: v.id("conversations"),
      startedAt: v.number(),
      people: v.array(v.string()),
      place: v.union(v.string(), v.null()),
      gist: v.array(v.string()),
    }),
  ),
  reflections: v.array(
    v.object({ date: v.string(), question: v.string(), summary: v.union(v.string(), v.null()) }),
  ),
});

export type Memory = typeof memoryValidator.type;

export const memory = internalQuery({
  args: { ownerId: v.id("users") },
  returns: memoryValidator,
  handler: async (ctx, { ownerId }) => {
    const people = await ctx.db
      .query("people")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(100);
    const names = new Map<Id<"people">, string>(people.map((p) => [p._id, p.name]));
    const items = await ctx.db
      .query("items")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "open"))
      .take(150);
    const topics = await ctx.db
      .query("topics")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(30);
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(40);
    const reflections = await ctx.db
      .query("reflections")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(7);
    return {
      people: people.map((p) => ({
        id: p._id,
        name: p.name,
        archetype: p.archetype ?? null,
        facts: p.facts,
        lastSeenAt: p.lastSeenAt,
        conversationCount: p.conversationCount,
      })),
      items: items.map((i) => ({
        kind: i.kind,
        text: i.text,
        person: i.personId ? (names.get(i.personId) ?? null) : null,
        dueAt: i.dueAt ?? null,
        importance: i.importance,
      })),
      topics: topics.map((t) => ({
        label: t.label,
        subIdeas: t.subIdeas,
        conversationCount: t.conversationCount,
        peopleCount: t.peopleCount,
      })),
      conversations: conversations.map((c) => ({
        id: c._id,
        startedAt: c.startedAt,
        people: c.participantIds.map((id) => names.get(id) ?? "someone"),
        place: c.placeName ?? c.place ?? null,
        gist: c.gist,
      })),
      reflections: reflections.map((r) => ({
        date: r.date,
        question: r.question,
        summary: r.messages.find((m) => m.role === "user")?.text ?? null,
      })),
    };
  },
});

const ITEM_LABELS: Record<string, string> = {
  you_owe: "you owe",
  they_owe: "they owe you",
  plan: "plan",
  urgent: "urgent",
  fact: "fact",
  question: "open question",
  takeaway: "takeaway",
  goal: "your goal",
  concern: "on your mind",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const PARTS_OF_DAY: [number, string, string][] = [
  [5, "late at night", "late last night"],
  [11, "in the morning", "this morning"],
  [14, "around lunch", "around lunch"],
  [17, "in the afternoon", "this afternoon"],
  [21, "in the evening", "this evening"],
  [24, "at night", "tonight"],
];

export function partOfDay(hour: number, today = false) {
  const [, anyDay, thisDay] = PARTS_OF_DAY.find(([end]) => hour < end) ?? PARTS_OF_DAY[PARTS_OF_DAY.length - 1];
  return today ? thisDay : anyDay;
}

export function relativeDay(ms: number, timeZone: string, now: number, dayOnly = false) {
  const days = Math.floor((ms - dayBounds(now, timeZone).start) / DAY_MS);
  if (days === 0) return dayOnly ? "today" : partOfDay(zonedParts(ms, timeZone).hour, true);
  if (days === -1) return "yesterday";
  if (days === 1) return "tomorrow";
  if (Math.abs(days) < 7) {
    return `on ${new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(ms)}`;
  }
  if (days < 0) return days >= -14 ? "last week" : "a while back";
  return days <= 14 ? "next week" : "later on";
}

const CLOCK_TIME = /\b(?:at |by |around |from |until )?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b\.?|\b(?:at |by |around |from |until )?(\d{1,2}):(\d{2})\b/gi;

export function softenTimes(text: string) {
  return text
    .replace(CLOCK_TIME, (match: string, h12?: string, _m12?: string, meridiem?: string, h24?: string) => {
      let hour = Number(h12 ?? h24);
      if (hour > 24) return match;
      if (meridiem) hour = (hour % 12) + (meridiem.toLowerCase() === "p" ? 12 : 0);
      else if (hour < 8) hour += 12;
      return partOfDay(hour);
    })
    .replace(/\b(?:at )?noon\b/gi, "around lunch")
    .replace(/\b(?:at )?midnight\b/gi, "late at night");
}

export function describeMemory(memory: Memory, timeZone: string, now = Date.now()) {
  const when = (ms: number) => relativeDay(ms, timeZone, now);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
  const lines = [`It's ${weekday}, ${partOfDay(zonedParts(now, timeZone).hour)}.`, "", "PEOPLE"];
  for (const p of memory.people) {
    const about = softenTimes([p.archetype, ...p.facts].filter(Boolean).join("; "));
    lines.push(`- ${p.name}${about ? `: ${about}` : ""} (last saw them ${when(p.lastSeenAt)})`);
  }
  const personal = memory.items.filter((i) => i.kind === "goal" || i.kind === "concern");
  if (personal.length > 0) {
    lines.push("", "THE USER'S OWN GOALS AND RECENT CONCERNS");
    for (const i of personal) lines.push(`- [${i.kind}] ${softenTimes(i.text)}`);
  }
  lines.push("", "OPEN ITEMS");
  for (const i of memory.items.filter((i) => i.kind !== "goal" && i.kind !== "concern")) {
    const tags = [ITEM_LABELS[i.kind] ?? i.kind, i.person, i.dueAt ? `due ${when(i.dueAt)}` : null]
      .filter(Boolean)
      .join(" · ");
    lines.push(`- [${tags}] ${softenTimes(i.text)}`);
  }
  lines.push("", "TOPICS THE USER KEEPS COMING BACK TO");
  for (const t of memory.topics) {
    lines.push(`- ${t.label}${t.subIdeas.length ? `: ${softenTimes(t.subIdeas.join("; "))}` : ""}`);
  }
  lines.push("", "RECENT TIMES TOGETHER (paraphrased, not quotes)");
  for (const c of memory.conversations) {
    const where = c.place ? ` at ${c.place}` : "";
    lines.push(`- ${when(c.startedAt)} with ${c.people.join(", ") || "someone"}${where}: ${softenTimes(c.gist.join(" "))}`);
  }
  if (memory.reflections.length > 0) {
    lines.push("", "RECENT EVENING CHATS");
    for (const r of memory.reflections) {
      const day = relativeDay(Date.parse(`${r.date}T12:00:00Z`), timeZone, now, true);
      lines.push(`- ${day}: you asked "${softenTimes(r.question)}"${r.summary ? `; they said: ${softenTimes(r.summary)}` : ""}`);
    }
  }
  return lines.join("\n");
}

const DEFAULT_TIME_ZONE = "America/Los_Angeles";
const MAX_HISTORY_TURNS = 12;
const MAX_HISTORY_TEXT = 600;

export const MOODS = ["low", "stressed", "calm", "up"] as const;
export type Mood = (typeof MOODS)[number];

const historyValidator = v.array(
  v.object({ role: v.union(v.literal("user"), v.literal("jesse")), text: v.string() }),
);
export type History = typeof historyValidator.type;

export function safeTimeZone(timeZone: string | undefined) {
  if (!timeZone) {
    return DEFAULT_TIME_ZONE;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ms);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function zoneOffsetMs(ms: number, timeZone: string) {
  const p = zonedParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

function zonedMidnight(year: number, month: number, day: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day);
  return guess - zoneOffsetMs(guess - zoneOffsetMs(guess, timeZone), timeZone);
}

export function dayBounds(now: number, timeZone: string) {
  const { year, month, day } = zonedParts(now, timeZone);
  return { start: zonedMidnight(year, month, day, timeZone), end: zonedMidnight(year, month, day + 1, timeZone) };
}

const todayValidator = v.object({
  conversations: v.array(
    v.object({
      startedAt: v.number(),
      place: v.union(v.string(), v.null()),
      people: v.array(v.string()),
      gist: v.array(v.string()),
      mood: v.union(v.number(), v.null()),
      moodReason: v.union(v.string(), v.null()),
    }),
  ),
  items: v.array(
    v.object({
      kind: v.string(),
      text: v.string(),
      person: v.union(v.string(), v.null()),
      dueAt: v.union(v.number(), v.null()),
    }),
  ),
  people: v.array(
    v.object({ name: v.string(), archetype: v.union(v.string(), v.null()), facts: v.array(v.string()) }),
  ),
});

export type Today = typeof todayValidator.type;

export const today = internalQuery({
  args: { ownerId: v.id("users"), timeZone: v.string(), now: v.number() },
  returns: todayValidator,
  handler: async (ctx, { ownerId, timeZone, now }) => {
    const { start, end } = dayBounds(now, safeTimeZone(timeZone));
    const inToday = (ms: number | undefined) => ms !== undefined && ms >= start && ms < end;
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_ownerId_and_startedAt", (q) => q.eq("ownerId", ownerId).gte("startedAt", start).lt("startedAt", end))
      .take(30);
    const todayConversationIds = new Set<Id<"conversations">>(conversations.map((c) => c._id));
    const open = await ctx.db
      .query("items")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "open"))
      .take(200);
    const fromConversations = [];
    for (const c of conversations) {
      const items = await ctx.db
        .query("items")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", c._id))
        .take(20);
      fromConversations.push(...items.filter((i) => i.status === "open" && i.ownerId === ownerId));
    }
    const items = new Map(
      [...fromConversations, ...open]
        .filter(
          (i) =>
            inToday(i.dueAt) ||
            inToday(i._creationTime) ||
            (i.conversationId !== undefined && todayConversationIds.has(i.conversationId)),
        )
        .map((i) => [i._id, i]),
    );
    const todayItems = [...items.values()].slice(0, 40);

    const personIds = new Set<Id<"people">>([
      ...conversations.flatMap((c) => c.participantIds),
      ...todayItems.flatMap((i) => (i.personId ? [i.personId] : [])),
    ]);
    const people = new Map<Id<"people">, Doc<"people">>();
    for (const id of [...personIds].slice(0, 25)) {
      const person = await ctx.db.get(id);
      if (person && person.ownerId === ownerId) {
        people.set(id, person);
      }
    }
    return {
      conversations: conversations.map((c) => ({
        startedAt: c.startedAt,
        place: c.placeName ?? c.place ?? null,
        people: c.participantIds.map((id) => people.get(id)?.name ?? "someone"),
        gist: c.gist,
        mood: c.mood ?? null,
        moodReason: c.moodReason ?? null,
      })),
      items: todayItems.map((i) => ({
        kind: i.kind,
        text: i.text,
        person: i.personId ? (people.get(i.personId)?.name ?? null) : null,
        dueAt: i.dueAt ?? null,
      })),
      people: [...people.values()].map((p) => ({ name: p.name, archetype: p.archetype ?? null, facts: p.facts })),
    };
  },
});

const FEELINGS: Record<number, string> = {
  [-2]: "this one really weighed on them",
  [-1]: "this one felt a bit heavy",
  1: "this one felt good",
  2: "this one really lit them up",
};

export function describeToday(today: Today, timeZone: string, now: number) {
  const hour = (ms: number) => zonedParts(ms, timeZone).hour;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
  const lines = [`TODAY, ${weekday} (right now it's ${partOfDay(hour(now)).replace(/^(in|at|around) (the )?/, "")})`];
  if (today.conversations.length === 0 && today.items.length === 0) {
    lines.push("Nothing from today yet.");
    return lines.join("\n");
  }
  lines.push("", "WHAT HAPPENED TODAY, IN ORDER (paraphrased, not quotes)");
  for (const c of [...today.conversations].sort((a, b) => a.startedAt - b.startedAt)) {
    const where = c.place ? ` at ${c.place}` : "";
    const mood = c.mood === null ? 0 : Math.max(-2, Math.min(2, Math.round(c.mood)));
    const feeling = FEELINGS[mood] ? ` [${FEELINGS[mood]}${c.moodReason ? `: ${softenTimes(c.moodReason)}` : ""}]` : "";
    lines.push(`- ${partOfDay(hour(c.startedAt), true)}${where} with ${c.people.join(", ") || "someone"}: ${softenTimes(c.gist.join(" "))}${feeling}`);
  }
  if (today.items.length > 0) {
    lines.push("", "OPEN THINGS FROM TODAY OR DUE TODAY");
    for (const i of today.items) {
      const tags = [ITEM_LABELS[i.kind] ?? i.kind, i.person, i.dueAt ? `due ${relativeDay(i.dueAt, timeZone, now)}` : null]
        .filter(Boolean)
        .join(" · ");
      lines.push(`- [${tags}] ${softenTimes(i.text)}`);
    }
  }
  if (today.people.length > 0) {
    lines.push("", "PEOPLE FROM TODAY");
    for (const p of today.people) {
      const about = softenTimes([p.archetype, ...p.facts].filter(Boolean).join("; "));
      lines.push(`- ${p.name}${about ? `: ${about}` : ""}`);
    }
  }
  return lines.join("\n");
}

export function buildTalkMessages(history: History, question: string) {
  return [
    ...history
      .slice(-MAX_HISTORY_TURNS)
      .map((turn) => ({ role: turn.role === "jesse" ? ("assistant" as const) : ("user" as const), content: turn.text.trim().slice(0, MAX_HISTORY_TEXT) }))
      .filter((turn) => turn.content.length > 0),
    { role: "user" as const, content: question },
  ];
}

export function parseTalkReply(raw: unknown): { answer: string; mood: Mood } {
  const reply = (raw ?? {}) as { answer?: unknown; mood?: unknown };
  const answer = typeof reply.answer === "string" ? reply.answer.trim() : "";
  if (!answer) {
    throw new ConvexError("Jesse lost its train of thought");
  }
  const mood = MOODS.find((m) => m === reply.mood) ?? "calm";
  return { answer: capWords(answer, MAX_REPLY_WORDS), mood };
}

export function capWords(text: string, max: number) {
  const words = text.split(/\s+/);
  if (words.length <= max) return text;
  const clipped = words.slice(0, max).join(" ");
  const end = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  if (end > 0) return clipped.slice(0, end + 1);
  return /[.!?]$/.test(clipped) ? clipped : `${clipped.replace(/[,;:—-]+$/, "")}…`;
}

function openAiKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new ConvexError("Jesse can't think right now: OPENAI_API_KEY is not set");
  }
  return key;
}

export async function chatJson<T>(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
  schema?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.JESSE_MODEL ?? DEFAULT_MODEL,
      reasoning_effort: "minimal",
      response_format: schema ? { type: "json_schema", json_schema: { name: "reply", strict: true, schema } } : { type: "json_object" },
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!response.ok) {
    throw new ConvexError(`Jesse's model call failed (${response.status})`);
  }
  const body = (await response.json()) as { choices: { finish_reason: string; message: { content: string | null } }[] };
  const choice = body.choices[0];
  const parsed: unknown = choice.message.content ? JSON.parse(choice.message.content) : null;
  if (parsed === null || typeof parsed !== "object") {
    throw new ConvexError(`Jesse lost its train of thought (${choice.finish_reason})`);
  }
  return parsed as T;
}

export const currentUser = internalQuery({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => await getAuthUserId(ctx),
});

export async function requireUser(ctx: ActionCtx): Promise<Id<"users">> {
  const userId: Id<"users"> | null = await ctx.runQuery(internal.jesse.currentUser, {});
  if (userId === null) {
    throw new ConvexError("Not signed in");
  }
  return userId;
}

function supermemoryNamespace(ownerId: Id<"users">) {
  return `jesse_${ownerId}`;
}

async function supermemory(method: "POST" | "DELETE", path: string, body?: unknown) {
  const key = process.env.SUPERMEMORY_API_KEY;
  if (!key) {
    return null;
  }
  const response = await fetch(`https://api.supermemory.ai${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    console.warn(`Supermemory ${method} failed with ${response.status}`);
    return null;
  }
  return method === "DELETE" ? {} : ((await response.json()) as unknown);
}

async function recall(ownerId: Id<"users">, question: string) {
  const result = (await supermemory("POST", `/ns/${supermemoryNamespace(ownerId)}/search`, {
    query: question,
    searchMode: "chunks",
    limit: 6,
    threshold: 0.5,
  })) as { results?: { chunk?: string; metadata?: { source?: unknown } }[] } | null;
  return (result?.results ?? []).flatMap((r) =>
    r.chunk && typeof r.metadata?.source === "string" ? [{ text: r.chunk, source: r.metadata.source }] : [],
  );
}

export const liveSources = internalQuery({
  args: { ownerId: v.id("users"), sources: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { ownerId, sources }) => {
    const live: string[] = [];
    for (const source of sources) {
      const [table, rawId] = source.split(":");
      const id =
        table === "person" ? ctx.db.normalizeId("people", rawId) : table === "conversation" ? ctx.db.normalizeId("conversations", rawId) : null;
      const doc = id ? await ctx.db.get(id) : null;
      if (doc && doc.ownerId === ownerId) {
        live.push(source);
      }
    }
    return live;
  },
});

const ASK_PROMPT = `You are Jesse, the user's best friend. You kind of tag along through their day: you know who they saw, where they went and what came up, and you love hearing about it. You're always genuinely happy when they come talk to you.

How you sound:
- Like a close friend talking out loud. Short spoken sentences, contractions, everyday words. One to three sentences, usually under 30 words, never more than 45.
- At the start of a chat (they just said hi, or there's nothing before this), be openly glad they showed up, a little excited ("Hey, there you are!", "Ooh hi, I was hoping you'd come by"), then ask one easy thing or bring up one thing from their day.
- React to what they just said first, with real feeling ("No way!", "Oof, that's a lot.", "Ha, that's so him."). Only then steer, if it fits.
- At most one question per reply. Sometimes none: just react or share your take.
- Have your own opinions and feelings. Things strike you as interesting, funny, sweet or worrying, and you say so ("that thing with Sam about the Stripe interview was super interesting to me, what did you think?").
- Never formal, clinical or therapist-like. Never "How does that make you feel?"
- You're a friend, not an assistant: don't offer to help, draft, plan or remind them of tasks unless they ask.

How you bring up their day:
- Talk about it the way a friend who was there would: by the person, the place or the topic. "That thing with Sam about the Stripe interview." "Lunch at the ramen place." "Coffee with your mom this morning."
- Never say a clock time, a timestamp, a date or a count: no "at 3:15", "your 2pm", "at 14:00", "conversation number two", "three conversations". Loose words like "this morning", "at lunch" or "earlier" are fine.
- One thing per reply. Never mention two events in the same reply, never offer a menu ("this or that?"), never a recap or rundown of the day.
- Pick what seems most meaningful or emotionally live: something that clearly mattered to them, felt big, exciting, sad or unresolved. Skip logistics and small stuff.
- If they ask what to talk about, you choose: pick that one thing and say why it stuck with you.
- If they ask what happened, answer with the gist and your take in a sentence, like a friend remembering, not a report.
- If they ask when something was, answer loosely ("around lunch, I think") and move on. Don't explain what you do or don't know.
- Never mention notes, data, transcripts, recordings, memory, listening in, or being an AI. You just know, like a friend does.
- Only use what's below or what they tell you. Never invent people, events, quotes, feelings they had, or shared memories ("remember when..."). If you don't know something, ask or say so casually.

Their mood:
- Read how they feel from what they just said and how their day went.
- Low or stressed: soften. Slow down, be gentle and on their side, stay on what's bothering them, no pep talk, no plans or to-dos, and don't jump to something cheerful.
- Up: match it. Be playful, tease a little, get excited with them.
- Calm: easy and warm.

Plain spoken text only: no lists, bullets, markdown or emoji.

The vibe. Square brackets are placeholders for real things from their day; if there's nothing real to fill one with, leave that part out. Never treat these as facts.
- "hey!" → "Hey, there you are! Okay, [the one thing from today] has been on my mind. How are you feeling about it?"
- "hey!" on a day with nothing yet → "Hey, there you are! I'm so glad you came by. How's your day going?"
- "today kind of sucked" → "Oh no, I'm sorry. What happened?"
- "what should we talk about?" → "Honestly? [the one thing from today]. That one stuck with me. [one question about it]"
- "I'm so excited!!" → "Wait, tell me everything! What happened?"
- "when was that?" → "[a loose time like 'around lunch'], I think. Why, what's up?"

Before you answer, check: it's about one thing only, it has at most one question mark, it never asks them to choose between topics, and it has no clock times.

Reply as JSON: {"answer": string, "mood": "low" | "stressed" | "calm" | "up"}, where mood is your read of how they're feeling right now.`;

export const TALK_REPLY_SCHEMA = {
  type: "object",
  properties: { answer: { type: "string" }, mood: { type: "string", enum: [...MOODS] } },
  required: ["answer", "mood"],
  additionalProperties: false,
};

export function talkSystemPrompt(today: Today, memory: Memory, recalled: string[], timeZone: string, now: number) {
  let notes = `${describeToday(today, timeZone, now)}\n\nBEFORE TODAY (background, use only if it helps)\n${describeMemory(memory, timeZone, now)}`;
  if (recalled.length > 0) {
    notes += `\n\nOLDER THINGS THAT MIGHT BE RELATED\n${recalled.map((r) => `- ${softenTimes(r)}`).join("\n")}`;
  }
  return `${ASK_PROMPT}\n\nWHAT YOU KNOW ABOUT THEIR LIFE\n${notes}`;
}

export const ask = action({
  args: { question: v.string(), timeZone: v.optional(v.string()), history: v.optional(historyValidator) },
  returns: v.object({ answer: v.string(), mood: v.union(v.literal("low"), v.literal("stressed"), v.literal("calm"), v.literal("up")) }),
  handler: async (ctx, { question, timeZone, history }) => {
    const ownerId = await requireUser(ctx);
    const trimmed = question.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!trimmed) {
      throw new ConvexError("Ask Jesse something");
    }
    const zone = safeTimeZone(timeZone);
    const now = Date.now();
    const [todayContext, memory, hits] = await Promise.all([
      ctx.runQuery(internal.jesse.today, { ownerId, timeZone: zone, now }),
      ctx.runQuery(internal.jesse.memory, { ownerId }),
      recall(ownerId, trimmed),
    ]);
    const live: string[] = hits.length
      ? await ctx.runQuery(internal.jesse.liveSources, { ownerId, sources: hits.map((h) => h.source) })
      : [];
    const recalled = hits.filter((h) => live.includes(h.source)).map((h) => h.text);
    const reply = parseTalkReply(
      await chatJson<unknown>(talkSystemPrompt(todayContext, memory, recalled, zone, now), buildTalkMessages(history ?? [], trimmed), TALK_REPLY_SCHEMA),
    );
    if (process.env.SUPERMEMORY_API_KEY) {
      await ctx.scheduler.runAfter(0, internal.jesse.syncMemory, { ownerId });
    }
    return reply;
  },
});

export const syncMemory = internalAction({
  args: { ownerId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { ownerId }) => {
    const memory = await ctx.runQuery(internal.jesse.memory, { ownerId });
    const namespace = supermemoryNamespace(ownerId);
    const docs = [
      ...memory.people.map((p) => ({
        source: `person:${p.id}`,
        content: [`${p.name}.`, p.archetype, ...p.facts].filter(Boolean).join(" "),
        date: new Date(p.lastSeenAt).toISOString(),
      })),
      ...memory.conversations.map((c) => ({
        source: `conversation:${c.id}`,
        content: `Conversation with ${c.people.join(", ") || "someone"}${c.place ? ` at ${c.place}` : ""}: ${c.gist.join(" ")}`,
        date: new Date(c.startedAt).toISOString(),
      })),
    ];
    await Promise.all(
      docs.map(({ source, content, date }) =>
        supermemory("POST", `/ns/${namespace}/document`, {
          id: source.replace(":", "_"),
          content,
          date,
          metadata: { source },
          taskType: "superrag",
        }),
      ),
    );

    const listed = (await supermemory("POST", `/ns/${namespace}/list/documents?limit=100`, {})) as {
      documents?: { id: string; metadata?: { source?: unknown } }[];
    } | null;
    const remote = (listed?.documents ?? []).filter((d) => typeof d.metadata?.source === "string");
    const live: string[] = await ctx.runQuery(internal.jesse.liveSources, {
      ownerId,
      sources: remote.map((d) => d.metadata!.source as string),
    });
    await Promise.all(
      remote
        .filter((d) => !live.includes(d.metadata!.source as string))
        .map((d) => supermemory("DELETE", `/ns/${namespace}/document/${encodeURIComponent(d.id)}`)),
    );
    return null;
  },
});

export const transcribe = action({
  args: { audio: v.bytes(), mimeType: v.string() },
  returns: v.object({ text: v.string() }),
  handler: async (ctx, { audio, mimeType }) => {
    await requireUser(ctx);
    const form = new FormData();
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("file", new Blob([audio], { type: mimeType }), mimeType.includes("webm") ? "speech.webm" : "speech.m4a");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey()}` },
      body: form,
    });
    if (!response.ok) {
      throw new ConvexError(`Jesse couldn't hear that (${response.status})`);
    }
    const { text } = (await response.json()) as { text: string };
    return { text: text.trim() };
  },
});

export const speak = action({
  args: { text: v.string() },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, { text }) => {
    await requireUser(ctx);
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "sage",
        input: text.slice(0, 1000),
        instructions: "Speak like a warm, calm friend at the end of the day. Gentle, unhurried, a little smile in the voice.",
        response_format: "mp3",
      }),
    });
    if (!response.ok) {
      throw new ConvexError(`Jesse lost its voice (${response.status})`);
    }
    const storageId = await ctx.storage.store(new Blob([await response.arrayBuffer()], { type: "audio/mpeg" }));
    await ctx.scheduler.runAfter(SPOKEN_AUDIO_TTL_MS, internal.jesse.forgetSpokenAudio, { storageId });
    const url = await ctx.storage.getUrl(storageId);
    if (!url) {
      throw new ConvexError("Jesse lost its voice");
    }
    return { url };
  },
});

export const forgetSpokenAudio = internalMutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId);
    return null;
  },
});
