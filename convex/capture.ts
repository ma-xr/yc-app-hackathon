import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalMutation } from "./_generated/server";
import { closeConversation, insertConversation } from "./conversations";
import { extractInto, MAX_CHUNK_BYTES, transcribe } from "./extract";
import { requireUser } from "./lib/auth";

export const GAP_MS = 15 * 60 * 1000;
const SEGMENT_MS = 10 * 60 * 1000;
export const CLOSE_IDLE_MS = GAP_MS + SEGMENT_MS;
const MIN_VOICED_MS = 5_000;

export function speechWindow(
  startedAt: number,
  endedAt: number,
  speechStart: number | null,
  speechEnd: number | null,
) {
  const clamp = (t: number) => Math.min(endedAt, Math.max(startedAt, t));
  return {
    speechStartedAt: clamp(startedAt + (speechStart ?? 0) * 1000),
    speechEndedAt: clamp(speechEnd === null ? endedAt : startedAt + speechEnd * 1000),
  };
}

export function continues(previous: Pick<Doc<"conversations">, "startedAt" | "endedAt"> | null, speechStartedAt: number) {
  if (previous === null) return false;
  return speechStartedAt - (previous.endedAt ?? previous.startedAt) < GAP_MS;
}

export const attachSegment = internalMutation({
  args: { speechStartedAt: v.number(), speechEndedAt: v.number() },
  handler: async (ctx, { speechStartedAt, speechEndedAt }) => {
    const ownerId = await requireUser(ctx);
    const open = (
      await ctx.db
        .query("conversations")
        .withIndex("by_ownerId_and_status", (q) => q.eq("ownerId", ownerId).eq("status", "listening"))
        .take(20)
    ).filter((c) => c.startedAt <= speechStartedAt);
    const latest = open.reduce<Doc<"conversations"> | null>(
      (best, c) => (best === null || c.startedAt > best.startedAt ? c : best),
      null,
    );

    let conversationId;
    if (latest !== null && continues(latest, speechStartedAt)) {
      conversationId = latest._id;
      await ctx.db.patch("conversations", conversationId, {
        endedAt: Math.max(latest.endedAt ?? latest.startedAt, speechEndedAt),
        pendingChunks: (latest.pendingChunks ?? 0) + 1,
      });
    } else {
      for (const c of open) await closeConversation(ctx, c, c.endedAt ?? c.startedAt);
      conversationId = await insertConversation(ctx, ownerId, speechStartedAt);
      await ctx.db.patch("conversations", conversationId, { endedAt: speechEndedAt, pendingChunks: 1 });
    }
    // TODO: split on a big topic change inside one stretch of talk.
    await ctx.scheduler.runAfter(
      Math.max(0, speechEndedAt + CLOSE_IDLE_MS - Date.now()),
      internal.capture.closeIfIdle,
      { conversationId },
    );
    return conversationId;
  },
});

export const closeIfIdle = internalMutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const conversation = await ctx.db.get("conversations", conversationId);
    if (conversation === null || conversation.status !== "listening") return null;
    const lastSpeech = conversation.endedAt ?? conversation.startedAt;
    if (Date.now() - lastSpeech < CLOSE_IDLE_MS) return null;
    await closeConversation(ctx, conversation, lastSpeech);
    return null;
  },
});

export const ingestSegment = action({
  args: { audio: v.bytes(), startedAt: v.number(), endedAt: v.number(), voicedMs: v.number() },
  handler: async (ctx, { audio, startedAt, endedAt, voicedMs }) => {
    if (audio.byteLength === 0 || audio.byteLength > MAX_CHUNK_BYTES) throw new ConvexError("Audio segment is empty or too large");
    if (endedAt < startedAt) throw new ConvexError("Segment ends before it starts");
    if ((await ctx.auth.getUserIdentity()) === null) throw new ConvexError("Not signed in");
    if (voicedMs < MIN_VOICED_MS) return null;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set on this deployment");
    const { text, speechStart, speechEnd } = await transcribe(audio, apiKey);
    if (text.length === 0) return null;
    const conversationId = await ctx.runMutation(
      internal.capture.attachSegment,
      speechWindow(startedAt, endedAt, speechStart, speechEnd),
    );
    let applied = false;
    try {
      applied = await extractInto(ctx, conversationId, text, apiKey);
    } catch {
      console.error("Segment extraction failed");
    } finally {
      if (!applied) await ctx.runMutation(internal.conversations.chunkFailed, { conversationId });
    }
    return null;
  },
});
