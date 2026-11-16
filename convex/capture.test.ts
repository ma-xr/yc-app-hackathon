/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { CLOSE_IDLE_MS, continues, GAP_MS, speechWindow } from "./capture";
import schema from "./schema";

vi.mock("@convex-dev/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@convex-dev/auth/server")>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity(): Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob("./**/*.ts");
const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 10, 15, 18, 0);

function fakeExtraction(transcript: string) {
  const name = /thanks, (\w+)/i.exec(transcript)?.[1] ?? null;
  return {
    place: null,
    gist: [],
    leftOutCount: 0,
    people: name ? [{ name, archetype: null, facts: [] }] : [],
    topics: [],
    items: name
      ? [{ kind: "you_owe" as const, text: `Send ${name} the deck`, personName: name, topicLabel: null, dueAt: null, importance: 3 }]
      : [],
  };
}

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const as = t.withIdentity({ subject: userId });
  const attach = (startMin: number, endMin: number) =>
    as.mutation(internal.capture.attachSegment, { speechStartedAt: T0 + startMin * MIN, speechEndedAt: T0 + endMin * MIN });
  const extract = (conversationId: Id<"conversations">, transcript: string) =>
    t.mutation(internal.conversations.applyExtraction, { conversationId, extraction: fakeExtraction(transcript) });
  const get = (id: Id<"conversations">) => t.run((ctx) => ctx.db.get("conversations", id));
  return { t, attach, extract, get };
}

describe("pure boundary helpers", () => {
  test("continues only within the gap", () => {
    expect(continues(null, T0)).toBe(false);
    expect(continues({ startedAt: T0, endedAt: T0 + 5 * MIN }, T0 + 5 * MIN + GAP_MS - 1)).toBe(true);
    expect(continues({ startedAt: T0, endedAt: T0 + 5 * MIN }, T0 + 5 * MIN + GAP_MS)).toBe(false);
    expect(continues({ startedAt: T0, endedAt: undefined }, T0 + 1 * MIN)).toBe(true);
  });

  test("speechWindow maps transcript offsets onto wall time and clamps", () => {
    expect(speechWindow(T0, T0 + 10 * MIN, 30, 90)).toEqual({ speechStartedAt: T0 + 30_000, speechEndedAt: T0 + 90_000 });
    expect(speechWindow(T0, T0 + 10 * MIN, null, null)).toEqual({ speechStartedAt: T0, speechEndedAt: T0 + 10 * MIN });
    expect(speechWindow(T0, T0 + MIN, 10, 999)).toEqual({ speechStartedAt: T0 + 10_000, speechEndedAt: T0 + MIN });
  });
});

describe("attachSegment", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 10 * MIN);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("a segment within the gap continues the same conversation", async () => {
    const { attach, extract, get } = await setup();
    const first = await attach(1, 6);
    await extract(first, "A: thanks, Sam. B: sure");
    vi.setSystemTime(T0 + 20 * MIN);
    const second = await attach(12, 18);
    expect(second).toEqual(first);
    const conversation = await get(first);
    expect(conversation).toMatchObject({ status: "listening", startedAt: T0 + MIN, endedAt: T0 + 18 * MIN, pendingChunks: 1 });
    expect(conversation?.participantIds).toHaveLength(1);
  });

  test("a segment after the gap starts a new conversation and closes the old one", async () => {
    const { attach, extract, get } = await setup();
    const first = await attach(1, 6);
    await extract(first, "A: thanks, Sam.");
    vi.setSystemTime(T0 + 40 * MIN);
    const second = await attach(6 + GAP_MS / MIN + 1, 30);
    expect(second).not.toEqual(first);
    expect(await get(first)).toMatchObject({ status: "done", endedAt: T0 + 6 * MIN });
    expect(await get(second)).toMatchObject({ status: "listening", startedAt: T0 + 22 * MIN, pendingChunks: 1 });
  });

  test("an old conversation closed while a chunk is pending finishes when extraction lands", async () => {
    const { attach, extract, get } = await setup();
    const first = await attach(1, 6);
    vi.setSystemTime(T0 + 40 * MIN);
    await attach(30, 35);
    expect(await get(first)).toMatchObject({ status: "processing" });
    await extract(first, "nothing much");
    expect(await get(first)).toMatchObject({ status: "done", pendingChunks: 0 });
  });

  test("the scheduled idle close ends a quiet conversation", async () => {
    const { t, attach, extract, get } = await setup();
    const id = await attach(1, 6);
    await extract(id, "A: thanks, Sam.");
    vi.advanceTimersByTime(CLOSE_IDLE_MS - 5 * MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await get(id)).toMatchObject({ status: "listening" });
    vi.advanceTimersByTime(MIN);
    await t.finishInProgressScheduledFunctions();
    expect(await get(id)).toMatchObject({ status: "done", endedAt: T0 + 6 * MIN });
  });

  test("the idle close skips a conversation that heard newer speech", async () => {
    const { t, attach, extract, get } = await setup();
    const id = await attach(1, 6);
    await extract(id, "hi");
    vi.setSystemTime(T0 + 20 * MIN);
    await attach(15, 19);
    await extract(id, "hi again");
    vi.setSystemTime(T0 + 6 * MIN + CLOSE_IDLE_MS + 1);
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    expect(await get(id)).toMatchObject({ status: "listening" });
    vi.advanceTimersByTime(CLOSE_IDLE_MS);
    await t.finishInProgressScheduledFunctions();
    expect(await get(id)).toMatchObject({ status: "done", endedAt: T0 + 19 * MIN });
  });
});
