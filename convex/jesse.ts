import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";

const DEFAULT_MODEL = "gpt-5-mini";
const MAX_QUESTION_LENGTH = 500;
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
        place: c.place ?? null,
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
  lines.push("", "OPEN ITEMS");
  for (const i of memory.items) {
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

async function supermemory(path: string, body: unknown) {
  const key = process.env.SUPERMEMORY_API_KEY;
  if (!key) {
    return null;
  }
  const response = await fetch(`https://api.supermemory.ai${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.warn(`Supermemory ${path.split("/").pop()} failed with ${response.status}`);
    return null;
  }
  return (await response.json()) as unknown;
}

async function recall(ownerId: Id<"users">, question: string) {
  const result = (await supermemory(`/ns/${supermemoryNamespace(ownerId)}/search`, {
    query: question,
    searchMode: "hybrid",
    limit: 6,
    threshold: 0.5,
  })) as { results?: { memory?: string; chunk?: string }[] } | null;
  return (result?.results ?? []).map((r) => r.memory ?? r.chunk).filter((t): t is string => !!t);
}

const ASK_PROMPT = `You are Jesse, a warm, calm companion who remembers the parts of the user's conversations that matter: promises, plans, and what people care about. You never keep the words themselves, only your own short notes, listed below.

Answer the user's question from these notes only. Rules:
- One to three short sentences, spoken out loud, so no lists, markdown or emoji.
- Be specific: names, days and times from the notes. Say times the way a friend would ("Thursday at 12:30"), never "due".
- If the notes don't cover it, say so kindly in one sentence and suggest what they could ask the person.
- When it fits, nudge gently toward the person ("Maybe text Sam good luck on Friday?").
- Never invent facts, quotes or sensitive details.

Reply as JSON: {"answer": string}.`;

export const ask = action({
  args: { question: v.string(), timeZone: v.optional(v.string()) },
  returns: v.object({ answer: v.string() }),
  handler: async (ctx, { question, timeZone }) => {
    const ownerId = await requireUser(ctx);
    const trimmed = question.trim().slice(0, MAX_QUESTION_LENGTH);
    if (!trimmed) {
      throw new ConvexError("Ask Jesse something");
    }
    const [memory, recalled] = await Promise.all([
      ctx.runQuery(internal.jesse.memory, { ownerId }),
      recall(ownerId, trimmed),
    ]);
    let notes = describeMemory(memory, timeZone ?? "America/Los_Angeles");
    if (recalled.length > 0) {
      notes += `\n\nOLDER MEMORIES (long-term recall)\n${recalled.map((r) => `- ${r}`).join("\n")}`;
    }
    const { answer } = await chatJson<{ answer: string }>(`${ASK_PROMPT}\n\nJESSE'S NOTES\n${notes}`, [
      { role: "user", content: trimmed },
    ]);
    if (process.env.SUPERMEMORY_API_KEY) {
      await ctx.scheduler.runAfter(0, internal.jesse.syncMemory, { ownerId });
    }
    return { answer };
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
        id: `person_${p.id}`,
        content: [`${p.name}.`, p.archetype, ...p.facts].filter(Boolean).join(" "),
        date: new Date(p.lastSeenAt).toISOString(),
      })),
      ...memory.conversations.map((c) => ({
        id: `conversation_${c.id}`,
        content: `Conversation with ${c.people.join(", ") || "someone"}${c.place ? ` at ${c.place}` : ""}: ${c.gist.join(" ")}`,
        date: new Date(c.startedAt).toISOString(),
      })),
      ...memory.reflections
        .filter((r) => r.summary)
        .map((r) => ({ id: `reflection_${r.date}`, content: `Evening reflection on "${r.question}": ${r.summary}` })),
    ];
    await Promise.all(
      docs.map((doc) =>
        supermemory(`/ns/${namespace}/document`, {
          ...doc,
          supportingContext: "Jesse's short notes about the user's conversations with friends. Notes, never quotes.",
        }),
      ),
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
