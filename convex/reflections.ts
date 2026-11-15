import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { chatJson, describeMemory, requireUser, type Memory } from "./jesse";
import { requireUser as requireSignedIn } from "./lib/auth";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NUMBER_WORDS = ["No one", "One person", "Two people", "Three people", "Four people", "Five people", "Six people", "Seven people", "Eight people", "Nine people", "Ten people"];

function asSecondPerson(label: string) {
  const lowered = label.charAt(0).toLowerCase() + label.slice(1);
  return lowered.replace(/\bI\b/g, "you").replace(/\bmy\b/gi, "your").replace(/\bme\b/gi, "you");
}

export const tonight = query({
  args: { date: v.string() },
  returns: v.union(
    v.object({
      question: v.string(),
      date: v.string(),
      topicId: v.union(v.id("topics"), v.null()),
      summary: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { date }) => {
    const ownerId = await getAuthUserId(ctx);
    if (ownerId === null) {
      return null;
    }
    const existing = await ctx.db
      .query("reflections")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).eq("date", date))
      .unique();
    if (existing) {
      return {
        question: existing.question,
        date,
        topicId: existing.topicId ?? null,
        summary: existing.messages.find((m) => m.role === "user")?.text ?? null,
      };
    }

    const weekStart = Date.parse(`${date}T00:00:00Z`) - WEEK_MS;
    const topics = await ctx.db
      .query("topics")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .take(50);
    const recent = topics.filter((t) => Number.isNaN(weekStart) || t.lastSeenAt >= weekStart);
    const topic = (recent.length > 0 ? recent : topics).sort(
      (a, b) => b.peopleCount - a.peopleCount || b.conversationCount - a.conversationCount,
    )[0];
    if (topic && topic.peopleCount >= 2) {
      const who = NUMBER_WORDS[topic.peopleCount] ?? `${topic.peopleCount} people`;
      return {
        question: `${who} talked with you about ${asSecondPerson(topic.label)} this week. What do you think?`,
        date,
        topicId: topic._id,
        summary: null,
      };
    }

    const openQuestions = await ctx.db
      .query("items")
      .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "open"))
      .take(150);
    const question = openQuestions
      .filter((i) => i.kind === "question")
      .sort((a, b) => b.importance - a.importance)[0];
    if (question) {
      return {
        question: `You've been turning this over: ${question.text.replace(/[.?!]*$/, "")}. Where are you landing?`,
        date,
        topicId: question.topicId ?? null,
        summary: null,
      };
    }
    if (topic) {
      return {
        question: `You keep coming back to ${asSecondPerson(topic.label)}. What do you think?`,
        date,
        topicId: topic._id,
        summary: null,
      };
    }
    return { question: "What stayed with you from today?", date, topicId: null, summary: null };
  },
});

const REFLECT_PROMPT = `You are Jesse, a warm, calm companion having a short evening check-in with the user about their day. You are human-centred and gently therapeutic, like a thoughtful friend, never a clinician.

How to talk:
- One to three short sentences. Plain spoken language, no lists, markdown or emoji.
- Reflect back what you heard in your own words, then ask at most one open question.
- Ground it in today using Jesse's notes below: the people, promises and topics.
- Nudge toward people when it fits: if they say something kind, honest or unresolved about someone, suggest telling that person ("Maybe tell Sam that?").
- Never diagnose, lecture or give a list of tips. Don't invent facts about anyone.
- If the user sounds in crisis or unsafe, gently encourage reaching out to someone they trust now, or calling or texting 988 in the US.
- After three or four exchanges, or when they want to stop, close warmly in one sentence with no question and no offers.

Also write "summary": at most 35 words, in the second person ("You think..."), capturing what the user thinks and feels across ALL their answers so far. It is the only thing kept, so: no quotes, no transcript, and nothing about other people's feelings or private lives; name them only as context for what the user thinks.

Reply as JSON: {"reply": string, "summary": string}.`;

const turnValidator = v.object({ role: v.union(v.literal("jesse"), v.literal("user")), text: v.string() });

export const reply = action({
  args: {
    date: v.string(),
    question: v.string(),
    topicId: v.optional(v.id("topics")),
    history: v.array(turnValidator),
    message: v.string(),
    timeZone: v.optional(v.string()),
  },
  returns: v.object({ reply: v.string(), summary: v.string() }),
  handler: async (ctx, { date, question, topicId, history, message, timeZone }): Promise<{ reply: string; summary: string }> => {
    const ownerId = await requireUser(ctx);
    const text = message.trim().slice(0, 2000);
    if (!text) {
      throw new ConvexError("Say something to Jesse");
    }
    const memory: Memory = await ctx.runQuery(internal.jesse.memory, { ownerId });
    const notes = describeMemory(memory, timeZone ?? "America/Los_Angeles");
    const earlier = memory.reflections.find((r) => r.date === date)?.summary;
    const context = earlier ? `\n\nWhat they shared earlier tonight (fold it into the new summary): ${earlier}` : "";
    const turns = [{ role: "jesse" as const, text: question }, ...history.slice(-12), { role: "user" as const, text }];
    const result = await chatJson<{ reply: string; summary: string }>(
      `${REFLECT_PROMPT}\n\nTonight's question: ${question}${context}\n\nJESSE'S NOTES\n${notes}`,
      turns.map((t) => ({ role: t.role === "jesse" ? ("assistant" as const) : ("user" as const), content: t.text })),
    );
    await ctx.runMutation(internal.reflections.save, {
      ownerId,
      date,
      question,
      topicId,
      summary: result.summary.slice(0, 400),
    });
    return { reply: result.reply, summary: result.summary };
  },
});

export const save = internalMutation({
  args: {
    ownerId: v.id("users"),
    date: v.string(),
    question: v.string(),
    topicId: v.optional(v.id("topics")),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { ownerId, date, question, topicId, summary }) => {
    const messages = [
      { role: "jesse" as const, text: question },
      { role: "user" as const, text: summary },
    ];
    const existing = await ctx.db
      .query("reflections")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).eq("date", date))
      .unique();
    if (existing) {
      await ctx.db.patch("reflections", existing._id, { messages });
      return null;
    }
    await ctx.db.insert("reflections", { ownerId, date, question, topicId, messages });
    return null;
  },
});

export const markCheckIn = mutation({
  args: {
    date: v.string(),
    state: v.union(v.literal("asked"), v.literal("accepted"), v.literal("snoozed"), v.literal("talked")),
    question: v.optional(v.string()),
    topicId: v.optional(v.id("topics")),
  },
  returns: v.null(),
  handler: async (ctx, { date, state, question, topicId }) => {
    const ownerId = await requireSignedIn(ctx);
    const existing = await ctx.db
      .query("reflections")
      .withIndex("by_ownerId_and_date", (q) => q.eq("ownerId", ownerId).eq("date", date))
      .unique();
    if (existing) {
      await ctx.db.patch("reflections", existing._id, { checkIn: state, checkInAt: Date.now() });
      return null;
    }
    if (!question) {
      return null;
    }
    if (topicId) {
      const topic = await ctx.db.get("topics", topicId);
      if (topic === null || topic.ownerId !== ownerId) {
        topicId = undefined;
      }
    }
    await ctx.db.insert("reflections", {
      ownerId,
      date,
      question: question.slice(0, 400),
      topicId,
      messages: [],
      checkIn: state,
      checkInAt: Date.now(),
    });
    return null;
  },
});
