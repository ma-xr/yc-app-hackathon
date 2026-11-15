import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

const OPENAI = "https://api.openai.com/v1";
const TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";
const EXTRACT_MODEL = process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5-mini";
const MAX_WORDS = 12;
const KINDS = ["you_owe", "they_owe", "plan", "urgent", "fact", "question", "takeaway"] as const;
type Kind = (typeof KINDS)[number];

const planForItem = makeFunctionReference<"mutation", { itemId: Id<"items"> }>("followups:planForItem");

const RUBRIC = `You are Jesse, a memory companion that listens to the phone owner's conversations and keeps only what a thoughtful friend would want to remember. You never keep the words themselves: write every note in your own voice, never as a quote.

The transcript is diarized: each line starts with a speaker label (A, B, ...). Labels are only valid for this chunk. One speaker is the phone owner ("you"). Work out who is who from names said aloud ("thanks, Sam", "I'm Dev"), from how people address each other, and from the known people list. Never invent a name. If a speaker's name is never heard and they are not clearly someone on the known list, leave them out of "people" and attribute their items with personName null. The owner never goes into "people".

Keep a candidate only if it passes at least one test:
1. Commitment: someone promised something, by a time or for a person. kind "you_owe" when the owner promised, "they_owe" when someone promised the owner, "plan" for a mutual plan with a time. Always kept.
2. Small but urgent: trivial but with a deadline or consequence (dentist, passport, a form). kind "urgent", with dueAt when a time is known.
3. Their life: something the other person would feel cared for if remembered: an upcoming event, a worry, a goal, a change (interview, exam, sister visiting, a move). kind "fact" with personName, and also add it to that person's "facts". Give it a dueAt when it has a date.
4. Open question: unresolved and still being thought about ("Stripe or startup?"). kind "question".
5. Recurring theme: a big-picture subject (relationships, career, money, AI, school). Put it in "topics"; reuse a known topic label when it fits, and set topicLabel on the related item.
6. Growth: a changed mind, a lesson, or advice worth keeping. kind "takeaway".

Drop: small talk, greetings, weather, food orders, logistics already settled, gossip about people who are not present, and sensitive details about others (health, money, relationships) unless the speaker shared them about themselves. Final check: drop anything the other person would be embarrassed to see in the owner's notes. Count every dropped small-talk moment in leftOutCount.

Rules:
- At most 5 items (usually 1-3). Each item text is 12 words or fewer, plain, starts with a name or verb, no quotes. Example: "Lunch with Sam Tuesday at 12", "Priya's midterm is Thursday".
- importance 1-5: 5 = a firm commitment with a time, 4 = urgent or an important event in their life, 3 = useful, 1-2 = nice to know.
- dueAt: local date-time "YYYY-MM-DDTHH:mm" in the owner's time zone, resolved against the current time given below ("Tuesday" = the next Tuesday after today; a day without a time = 09:00), or null.
- Do not repeat anything in the already-noted items for this conversation.
- gist: 0-3 short lines (6 words or fewer each) for what this conversation was about. Skip lines already in the existing gist.
- people.archetype: one short line like "Classmate · exams and study plans", or null if unclear.
- people.facts: each 12 words or fewer, only "their life" facts.
- place: a one-word setting if it is obvious (Lunch, Coffee, Call, Class), else null.
- If the transcript holds nothing worth keeping, return empty arrays and only count leftOutCount.`;

const nullableString = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["place", "gist", "leftOutCount", "people", "topics", "items"],
  properties: {
    place: nullableString,
    gist: { type: "array", items: { type: "string" } },
    leftOutCount: { type: "integer" },
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "archetype", "facts"],
        properties: {
          name: { type: "string" },
          archetype: nullableString,
          facts: { type: "array", items: { type: "string" } },
        },
      },
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "subIdeas"],
        properties: {
          label: { type: "string" },
          subIdeas: { type: "array", items: { type: "string" } },
        },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "personName", "topicLabel", "dueAt", "importance"],
        properties: {
          kind: { type: "string", enum: KINDS },
          text: { type: "string" },
          personName: nullableString,
          topicLabel: nullableString,
          dueAt: nullableString,
          importance: { type: "integer", enum: [1, 2, 3, 4, 5] },
        },
      },
    },
  },
};

type Raw = Record<string, unknown>;

const isString = (x: unknown): x is string => typeof x === "string";
const optString = (x: unknown) => (isString(x) && x.trim().length > 0 ? x.trim() : null);
const strings = (x: unknown) => (Array.isArray(x) ? x.filter(isString).map((s) => s.trim()).filter(Boolean) : []);
const short = (s: string) => s.split(/\s+/).length <= MAX_WORDS;
const array = (x: unknown): Raw[] => (Array.isArray(x) ? x.filter((e): e is Raw => typeof e === "object" && e !== null) : []);

const PT_OFFSET = "-08:00";

function localNow(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")} (America/Los_Angeles)`;
}

function parseDue(x: unknown) {
  if (!isString(x) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x)) return null;
  const ms = Date.parse(`${x}:00${PT_OFFSET}`);
  return Number.isNaN(ms) ? null : ms;
}

export function validateExtraction(raw: unknown) {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Raw;
  return {
    place: optString(r.place),
    gist: strings(r.gist).filter(short).slice(0, 3),
    leftOutCount: typeof r.leftOutCount === "number" && r.leftOutCount > 0 ? Math.round(r.leftOutCount) : 0,
    people: array(r.people)
      .map((p) => ({ name: optString(p.name), archetype: optString(p.archetype), facts: strings(p.facts).filter(short) }))
      .filter((p): p is { name: string; archetype: string | null; facts: string[] } =>
        p.name !== null && !/^(you|me|speaker\s*\w?|[a-z])$/i.test(p.name),
      ),
    topics: array(r.topics)
      .map((t) => ({ label: optString(t.label), subIdeas: strings(t.subIdeas).filter(short) }))
      .filter((t): t is { label: string; subIdeas: string[] } => t.label !== null),
    items: array(r.items)
      .map((i) => ({
        kind: KINDS.includes(i.kind as Kind) ? (i.kind as Kind) : null,
        text: optString(i.text),
        personName: optString(i.personName),
        topicLabel: optString(i.topicLabel),
        dueAt: parseDue(i.dueAt),
        importance: typeof i.importance === "number" ? Math.min(5, Math.max(1, Math.round(i.importance))) : 3,
      }))
      .filter(
        (i): i is { kind: Kind; text: string; personName: string | null; topicLabel: string | null; dueAt: number | null; importance: number } =>
          i.kind !== null && i.text !== null && short(i.text),
      )
      .slice(0, 5),
  };
}

async function transcribe(audio: Blob, apiKey: string) {
  const form = new FormData();
  form.append("file", audio, `chunk.${audio.type.includes("wav") ? "wav" : "m4a"}`);
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "diarized_json");
  form.append("chunking_strategy", "auto");
  const res = await fetch(`${OPENAI}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed with HTTP ${res.status}`);
  const body = (await res.json()) as { segments?: { speaker?: string; text?: string }[]; text?: string };
  const lines: string[] = [];
  for (const segment of body.segments ?? []) {
    const text = segment.text?.trim();
    if (!text) continue;
    const speaker = segment.speaker ?? "?";
    const last = lines.length - 1;
    if (last >= 0 && lines[last].startsWith(`${speaker}: `)) lines[last] += ` ${text}`;
    else lines.push(`${speaker}: ${text}`);
  }
  return lines.length > 0 ? lines.join("\n") : (body.text ?? "").trim();
}

async function extract(transcript: string, context: unknown, apiKey: string) {
  const res = await fetch(`${OPENAI}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EXTRACT_MODEL,
      messages: [
        { role: "system", content: RUBRIC },
        {
          role: "user",
          content: `Current time: ${localNow(Date.now())}\n\nWhat Jesse already knows (JSON):\n${JSON.stringify(context)}\n\nTranscript chunk:\n${transcript}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "jesse_memory", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`Extraction failed with HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Extraction returned no content");
  return validateExtraction(JSON.parse(content));
}

export const processChunk = internalAction({
  args: { conversationId: v.id("conversations"), storageId: v.id("_storage") },
  handler: async (ctx, { conversationId, storageId }) => {
    let applied = false;
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set on this deployment");
      const audio = await ctx.storage.get(storageId);
      if (audio === null) throw new Error("Audio chunk is missing");
      const transcript = await transcribe(audio, apiKey);
      await ctx.storage.delete(storageId);
      if (transcript.length === 0) return null;
      const context = await ctx.runQuery(internal.conversations.extractionContext, { conversationId });
      if (context === null) return null;
      const extraction = await extract(transcript, context, apiKey);
      const planIds = await ctx.runMutation(internal.conversations.applyExtraction, { conversationId, extraction });
      applied = true;
      for (const itemId of planIds) {
        try {
          await ctx.scheduler.runAfter(0, planForItem, { itemId });
        } catch {
          console.warn("followups.planForItem is not deployed yet; the follow-up sweep will pick this item up");
        }
      }
      return null;
    } finally {
      await ctx.storage.delete(storageId).catch(() => undefined);
      if (!applied) await ctx.runMutation(internal.conversations.chunkFailed, { conversationId });
    }
  },
});
