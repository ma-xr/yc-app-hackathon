import { describe, expect, test } from "vitest";
import { personScores } from "./lib/personScores";

const signal = (fun: number, overlap: number, depth: number) => ({ fun, overlap, depth });
const mix = (personal: number) => ({ work: 1 - personal, personal, logistics: 0 });

describe("personScores", () => {
  test("one conversation follows the documented formulas", () => {
    expect(personScores([{ minutes: 30, mood: 2, topicMix: mix(0.5), signal: signal(3, 0, 3) }], 4)).toEqual({
      funScore: 100,
      compatibilityScore: 40,
      deepTalkScore: 80,
    });
  });

  test("conversations are weighted by minutes", () => {
    const scores = personScores(
      [
        { minutes: 30, mood: 2, topicMix: mix(1), signal: signal(3, 3, 3) },
        { minutes: 10, mood: -2, topicMix: mix(0), signal: signal(0, 0, 0) },
      ],
      8,
    );
    expect(scores).toEqual({ funScore: 75, compatibilityScore: 75, deepTalkScore: 80 });
  });

  test("missing inputs are skipped per score", () => {
    const scores = personScores(
      [
        { minutes: 20, mood: 0, signal: signal(1, 2, 3) },
        { minutes: 60, signal: signal(3, 3, 0) },
        { minutes: 60, mood: 2 },
      ],
      0,
    );
    expect(scores.funScore).toBe(40);
    expect(scores.compatibilityScore).toBe(60);
    expect(scores.deepTalkScore).toBe(15);
  });

  test("no data gives no scores", () => {
    expect(personScores([{ minutes: 30, mood: 1, topicMix: mix(1) }], 3)).toEqual({
      funScore: undefined,
      compatibilityScore: undefined,
      deepTalkScore: undefined,
    });
    expect(personScores([], 0)).toEqual({ funScore: undefined, compatibilityScore: undefined, deepTalkScore: undefined });
  });
});
