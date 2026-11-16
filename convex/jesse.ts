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

export function describeMemory(memory: Memory, timeZone: string) {
  const when = (ms: number) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(ms);
  const lines = [`Right now it is ${when(Date.now())} (${timeZone}).`, "", "PEOPLE"];
  for (const p of memory.people) {
    const about = [p.archetype, ...p.facts].filter(Boolean).join("; ");
    lines.push(`- ${p.name}${about ? `: ${about}` : ""} (last talked ${when(p.lastSeenAt)}, ${p.conversationCount} conversations)`);
  }
  const personal = memory.items.filter((i) => i.kind === "goal" || i.kind === "concern");
  if (personal.length > 0) {
    lines.push("", "THE USER'S OWN GOALS AND RECENT CONCERNS");
    for (const i of personal) lines.push(`- [${i.kind}] ${i.text}`);
  }
  lines.push("", "OPEN ITEMS");
  for (const i of memory.items.filter((i) => i.kind !== "goal" && i.kind !== "concern")) {
    const tags = [ITEM_LABELS[i.kind] ?? i.kind, i.person, i.dueAt ? `due ${when(i.dueAt)}` : null]
      .filter(Boolean)
      .join(" · ");
    lines.push(`- [${tags}] ${i.text}`);
  }
  lines.push("", "TOPICS THE USER KEEPS TALKING ABOUT");
  for (const t of memory.topics) {
    lines.push(`- ${t.label} (${t.conversationCount} conversations, ${t.peopleCount} people): ${t.subIdeas.join("; ")}`);
  }
  lines.push("", "RECENT CONVERSATIONS (Jesse's notes, not quotes)");
  for (const c of memory.conversations) {
    const where = c.place ? ` · ${c.place}` : "";
    lines.push(`- ${when(c.startedAt)} with ${c.people.join(", ") || "someone"}${where}: ${c.gist.join(" ")}`);
  }
  if (memory.reflections.length > 0) {
    lines.push("", "RECENT EVENING REFLECTIONS");
    for (const r of memory.reflections) {
      lines.push(`- ${r.date}: asked "${r.question}"${r.summary ? `; the user said: ${r.summary}` : ""}`);
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

export function describeToday(today: Today, timeZone: string, now: number) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long", month: "long", day: "numeric" }).format(now);
  const time = (ms: number) => new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(ms);
  const lines = [`TODAY, ${day} (it's ${time(now)} now)`];
  if (today.conversations.length === 0 && today.items.length === 0) {
    lines.push("Nothing from today has been captured yet.");
    return lines.join("\n");
  }
  lines.push("", "WHAT HAPPENED TODAY (Jesse's notes, not quotes)");
  for (const c of [...today.conversations].sort((a, b) => a.startedAt - b.startedAt)) {
    const where = c.place ? ` at ${c.place}` : "";
    lines.push(`- ${time(c.startedAt)}${where} with ${c.people.join(", ") || "someone"}: ${c.gist.join(" ")}`);
  }
  if (today.items.length > 0) {
    lines.push("", "OPEN THINGS FROM TODAY OR DUE TODAY");
    for (const i of today.items) {
      const tags = [ITEM_LABELS[i.kind] ?? i.kind, i.person, i.dueAt ? `at ${time(i.dueAt)}` : null].filter(Boolean).join(" · ");
      lines.push(`- [${tags}] ${i.text}`);
    }
  }
  if (today.people.length > 0) {
    lines.push("", "PEOPLE FROM TODAY");
    for (const p of today.people) {
      const about = [p.archetype, ...p.facts].filter(Boolean).join("; ");
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

export async function chatJson<T>(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.JESSE_MODEL ?? DEFAULT_MODEL,
      reasoning_effort: "minimal",
      response_format: { type: "json_object" },
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

const ASK_PROMPT = `You are Jesse, the user's close friend. You were there for their day in a way: you keep short notes about who they talked to, where, and what mattered, never the words themselves. You care about them a lot, you're on their side, and they can tell you anything.

How you talk:
- Like a real friend out loud: one to three short sentences, at most 45 words in total and usually under 30. Plain words, contractions. Never formal, never clinical, never a therapist voice.
- Don't recap everything. Pick the one thing that matters most right now.
- No lists, markdown or emoji. Never say you're an AI or mention notes, data or memory.
- Read their mood from what they just said and the tone of today. If they seem low or stressed, slow down, be gentle and reassuring, and don't pile on plans. If they're up, match the energy and be playful. If they're calm, be easy and warm.
- Bring in specifics from today when they fit: names, places, times ("at lunch with Sam at Blue Bottle"). Weave them in, don't recite the day back.
- Ask at most one gentle follow-up question, and only when it fits.
- Only use what's in the notes or what they tell you. Never invent people, events, quotes or details. If you don't know, say so like a friend would.

Reply as JSON: {"answer": string, "mood": "low" | "stressed" | "calm" | "up"}, where mood is your read of how they're feeling right now.`;

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
    let notes = `${describeToday(todayContext, zone, now)}\n\nLONGER-TERM MEMORY (background, use only if it helps)\n${describeMemory(memory, zone)}`;
    if (recalled.length > 0) {
      notes += `\n\nOLDER MEMORIES (long-term recall)\n${recalled.map((r) => `- ${r}`).join("\n")}`;
    }
    const reply = parseTalkReply(
      await chatJson<unknown>(`${ASK_PROMPT}\n\nJESSE'S NOTES\n${notes}`, buildTalkMessages(history ?? [], trimmed)),
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
