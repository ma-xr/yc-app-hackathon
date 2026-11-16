export type ScoreInput = {
  minutes: number;
  mood?: number;
  topicMix?: { work: number; personal: number; logistics: number };
  signal?: { fun: number; overlap: number; depth: number };
};

export type PersonScores = {
  funScore?: number;
  compatibilityScore?: number;
  deepTalkScore?: number;
};

const DEEP_TOPICS = 8;

function weightedMean(pairs: { weight: number; value: number }[]) {
  const total = pairs.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return undefined;
  return pairs.reduce((sum, p) => sum + p.weight * p.value, 0) / total;
}

const percent = (x: number | undefined) => (x === undefined ? undefined : Math.round(100 * Math.min(1, Math.max(0, x))));

/**
 * Scores for one person, computed from every conversation they were in. Each conversation is weighted by its minutes.
 * A conversation missing an input is skipped for the scores that need it; a score with no data is undefined.
 *
 * funScore           = 100 * mean(0.6 * fun / 3 + 0.4 * (mood + 2) / 4)
 * compatibilityScore = 100 * mean(0.6 * overlap / 3 + 0.4 * (mood + 2) / 4)
 * deepTalkScore      = 100 * (0.6 * mean(depth) / 3 + 0.2 * min(1, distinctTopicCount / 8) + 0.2 * mean(topicMix.personal))
 *
 * deepTalkScore needs at least one depth signal; mean(topicMix.personal) counts as 0 when no conversation has a topic mix.
 */
export function personScores(conversations: ScoreInput[], distinctTopicCount: number): PersonScores {
  const signalled = conversations.filter((c) => c.signal !== undefined && c.minutes > 0);
  const rated = signalled.filter((c) => c.mood !== undefined);
  const moodPart = (c: ScoreInput) => 0.4 * ((c.mood! + 2) / 4);
  const fun = weightedMean(rated.map((c) => ({ weight: c.minutes, value: 0.6 * (c.signal!.fun / 3) + moodPart(c) })));
  const overlap = weightedMean(rated.map((c) => ({ weight: c.minutes, value: 0.6 * (c.signal!.overlap / 3) + moodPart(c) })));
  const depth = weightedMean(signalled.map((c) => ({ weight: c.minutes, value: c.signal!.depth / 3 })));
  const personal =
    weightedMean(
      conversations.filter((c) => c.topicMix !== undefined).map((c) => ({ weight: c.minutes, value: c.topicMix!.personal })),
    ) ?? 0;
  return {
    funScore: percent(fun),
    compatibilityScore: percent(overlap),
    deepTalkScore:
      depth === undefined ? undefined : percent(0.6 * depth + 0.2 * Math.min(1, distinctTopicCount / DEEP_TOPICS) + 0.2 * personal),
  };
}
