import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { findOrCreatePerson, nearDuplicate } from "./conversations";
import { addInteraction, replaceInteraction } from "./lib/contactStats";
import { profileFactKind } from "./schema";

const EXTRACT_MODEL = process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5-mini";
const MAX_FACT_WORDS = 12;
const MAX_TITLE_WORDS = 6;
const MAX_POINT_WORDS = 14;
const MAX_POINTS = 4;
const MAX_PROFILE_FACTS = 40;
const FACT_KINDS = [
  "from",
  "interest",
  "working_on",
  "matters",
  "how_met",
  "relationship",
  "family",
  "life_event",
  "place",
  "gift_idea",
  "style",
  "food",
  "avoid",
] as const;
type FactKind = (typeof FACT_KINDS)[number];

const PROMPT = `You are Jesse, a memory companion that helps the phone owner remember the people they talk to. You never keep the words themselves: write every note in your own voice, never as a quote.

The transcript is diarized: each line starts with a speaker label (A, B, ...). Labels are only valid for this chunk. One speaker is the phone owner ("you"). Work out who is who from names said aloud ("thanks, Sam", "I'm Dev"), from how people address each other, and from the known people list. Never invent a name. If a speaker's name is never heard and they are not clearly someone on the known list, leave them out. The owner never goes into "people". A name someone uses to address the owner ("thanks, Maya") is the owner's own name: never add it to "people" and never record it as a fact about anyone.

For each named person who took part in this conversation (not people only mentioned), return:
- facts: what this person shared about themselves that a thoughtful friend would remember. Each has a kind and a text of 12 words or fewer, plain, no quotes, e.g. {"kind":"from","text":"Grew up in Lisbon"}. Kinds: from (hometown or origin), interest (hobbies, passions), working_on (job, project, studies), matters (what they care about), how_met (how the owner met them), relationship (partner, dating), family, life_event (move, new job, upcoming event), place (where they live or hang out), gift_idea, style, food (likes, dislikes, diet), avoid (topics or things to steer clear of). Only things the person said about themselves. Never record anything embarrassing, and never sensitive details (health, money, relationships) about anyone other than the speaker sharing them. Usually 0-4 facts. Skip anything already in their known profile.
- interaction: a summary of this part of the conversation with them. title: 6 words or fewer ("Coffee chat about startups"). points: 2-4 short lines in your own words about what you two talked about, never quotes. depth 1-5: 1 = small talk, 3 = real exchange of ideas or plans, 5 = vulnerable or deeply meaningful. fun 1-5: 1 = flat or tense, 5 = lots of laughter and energy. sharedInterests: interests both the owner and this person showed (short labels like "climbing", "AI"), or an empty array.

If nobody is named, return an empty people array.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["people"],
  properties: {
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "facts", "interaction"],
        properties: {
          name: { type: "string" },
          facts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["kind", "text"],
              properties: {
                kind: { type: "string", enum: FACT_KINDS },
                text: { type: "string" },
              },
            },
          },
          interaction: {
            type: "object",
            additionalProperties: false,
            required: ["title", "points", "depth", "fun", "sharedInterests"],
            properties: {
              title: { type: "string" },
              points: { type: "array", items: { type: "string" } },
              depth: { type: "integer", enum: [1, 2, 3, 4, 5] },
              fun: { type: "integer", enum: [1, 2, 3, 4, 5] },
              sharedInterests: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

const contactPerson = v.object({
  name: v.string(),
  facts: v.array(v.object({ kind: profileFactKind, text: v.string() })),
  interaction: v.object({
    title: v.string(),
    points: v.array(v.string()),
    depth: v.number(),
    fun: v.number(),
    sharedInterests: v.array(v.string()),
  }),
});
export type ContactPerson = Infer<typeof contactPerson>;

type Raw = Record<string, unknown>;
const isString = (x: unknown): x is string => typeof x === "string";
const clean = (x: unknown) => (isString(x) ? x.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim() : "");
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const object = (x: unknown): Raw => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Raw) : {});
const array = (x: unknown): Raw[] => (Array.isArray(x) ? x.filter((e): e is Raw => typeof e === "object" && e !== null) : []);
const lines = (x: unknown, maxWords: number) =>
  Array.isArray(x) ? x.map(clean).filter((s) => s.length > 0 && words(s) <= maxWords) : [];
const score = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? Math.min(5, Math.max(1, Math.round(x))) : 3);

function dedupe(texts: string[]) {
  const kept: string[] = [];
  for (const t of texts) if (!kept.some((k) => nearDuplicate(k, t))) kept.push(t);
  return kept;
}

export function validateContactExtraction(raw: unknown): ContactPerson[] {
  const seen = new Set<string>();
  const people: ContactPerson[] = [];
  for (const p of array(object(raw).people)) {
    const name = clean(p.name);
    if (!name || /^(you|me|owner|unknown|speaker\s*\w?|[a-z])$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    const i = object(p.interaction);
    const title = clean(i.title);
    const points = dedupe(lines(i.points, MAX_POINT_WORDS)).slice(0, MAX_POINTS);
    if (!title || words(title) > MAX_TITLE_WORDS || points.length < 2) continue;
    seen.add(key);
    const facts = array(p.facts)
      .map((f) => ({ kind: f.kind as FactKind, text: clean(f.text) }))
      .filter((f) => FACT_KINDS.includes(f.kind) && f.text.length > 0 && words(f.text) <= MAX_FACT_WORDS);
    people.push({
      name,
      facts: facts.filter((f, idx) => !facts.slice(0, idx).some((g) => nearDuplicate(g.text, f.text))).slice(0, 8),
      interaction: {
        title,
        points,
        depth: score(i.depth),
        fun: score(i.fun),
        sharedInterests: lines(i.sharedInterests, 4)
          .filter((s, idx, all) => all.findIndex((t) => t.toLowerCase() === s.toLowerCase()) === idx)
          .slice(0, 8),
      },
    });
  }
  return people;
}

export async function extractContactDetails(
  transcript: string,
  context: { people: string[]; participants: string[] },
  apiKey: string,
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EXTRACT_MODEL,
      ...(EXTRACT_MODEL.startsWith("gpt-5") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: `Known people and this conversation's participants (JSON):\n${JSON.stringify(context)}\n\nTranscript chunk:\n${transcript}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "jesse_contacts", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`Contact extraction failed with HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Contact extraction returned no content");
  return validateContactExtraction(JSON.parse(content));
}

export const applyContactExtraction = internalMutation({
  args: { conversationId: v.id("conversations"), people: v.array(contactPerson) },
  handler: async (ctx, { conversationId, people }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null || people.length === 0) return null;
    const ownerId = conversation.ownerId;
    const now = Date.now();
    const known = await ctx.db
      .query("people")
      .withIndex("by_ownerId_and_lastSeenAt", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(200);
    const existing = await ctx.db
      .query("interactions")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversationId))
      .take(50);
    const minutes = Math.max(1, Math.round(((conversation.endedAt ?? now) - conversation.startedAt) / 60000));
    const placeName = conversation.placeName ?? conversation.place;

    for (const heard of people) {
      const person = await findOrCreatePerson(ctx, ownerId, known, heard.name, now);
      const before = person.profile ?? [];
      const profile = [...before];
      for (const fact of heard.facts) {
        if (profile.some((f) => nearDuplicate(f.text, fact.text))) continue;
        profile.push({ kind: fact.kind, text: fact.text, conversationId, learnedAt: now });
      }
      if (profile.length !== before.length) {
        await ctx.db.patch("people", person._id, { profile: profile.slice(-MAX_PROFILE_FACTS) });
      }

      const summary = heard.interaction;
      const previous = existing.find((i) => i.personId === person._id);
      if (previous === undefined) {
        const input = {
          ownerId,
          personId: person._id,
          conversationId,
          kind: "in_person" as const,
          startedAt: conversation.startedAt,
          minutes,
          placeName,
          title: summary.title,
          points: summary.points,
          depth: summary.depth,
          fun: summary.fun,
          sharedInterests: summary.sharedInterests,
        };
        const id = await addInteraction(ctx, input);
        existing.push({ ...input, _id: id, _creationTime: now });
        continue;
      }
      await replaceInteraction(ctx, previous, {
        minutes,
        placeName: previous.placeName ?? placeName,
        points: dedupe([...summary.points, ...previous.points]).slice(0, MAX_POINTS),
        depth: Math.round((previous.depth + summary.depth) / 2),
        fun: Math.round((previous.fun + summary.fun) / 2),
        sharedInterests: [...(previous.sharedInterests ?? []), ...summary.sharedInterests].filter(
          (s, idx, all) => all.findIndex((t) => t.toLowerCase() === s.toLowerCase()) === idx,
        ),
      });
    }
    return null;
  },
});
