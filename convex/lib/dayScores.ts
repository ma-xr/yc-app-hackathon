import type { Doc, Id } from "../_generated/dataModel";
import { conversationMinutes } from "../insights";

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const TEXT_MINUTES = 5;
const DEFAULT_BASELINE_MINUTES = 180;
const BASELINE_AFTER_DAYS = 7;
const FOCUS_MINUTES = 120;
const FOCUS_GAP_MS = 30 * MINUTE;
const NUDGE_FACTOR = 1.5;
const TIME_ZONE = "America/Los_Angeles";

type Conversation = Doc<"conversations">;
type Person = Doc<"people">;
type ActivityType = NonNullable<Conversation["activityType"]>;
type Relationship = NonNullable<Person["relationship"]>;
export type DayScores = Omit<Doc<"days">, "_id" | "_creationTime" | "ownerId" | "date" | "computedAt" | "writtenAt" | "userRating">;

export type PreviousDay = {
  score: number;
  mood: { score: number };
  people: { score: number; totalMinutes: number };
  activity: { score: number };
};

export type DayInput = {
  conversations: Conversation[];
  people: Person[];
  topicLabels: Map<Id<"topics">, string>;
  history: PreviousDay[];
  dayEnd: number;
  dataDays: number;
};

const clamp = (x: number) => Math.min(100, Math.max(0, Math.round(x)));
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: number[]) => (xs.length === 0 ? undefined : xs.reduce((a, b) => a + b, 0) / xs.length);
const placeOf = (c: Conversation) => c.placeName ?? c.place;
const unique = <T,>(xs: T[]) => [...new Set(xs)];

/** Minutes a conversation counts for: text channels (iMessage, email) count as 5, everything else uses conversationMinutes. */
export function talkMinutes(c: Conversation) {
  return c.channel === "imessage" || c.channel === "email" ? TEXT_MINUTES : conversationMinutes(c);
}

/** Minute-weighted mean of value over the conversations that have one; undefined when none do. */
function weighted(conversations: Conversation[], value: (c: Conversation) => number | undefined) {
  let sum = 0;
  let minutes = 0;
  for (const c of conversations) {
    const x = value(c);
    if (x === undefined) continue;
    sum += x * talkMinutes(c);
    minutes += talkMinutes(c);
  }
  return minutes === 0 ? undefined : sum / minutes;
}

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function localHour(ms: number) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(ms));
}

function activityNoun(c: Conversation) {
  if (c.activityType === "meal") {
    const hour = localHour(c.startedAt);
    return hour < 11 ? "breakfast" : hour < 16 ? "lunch" : "dinner";
  }
  if (c.activityType === "building") return "building";
  if (c.activityType === "meeting") return "meeting";
  if (c.activityType === "social") return "hanging out";
  if (c.activityType === "exercise") return "workout";
  if (c.activityType === "outdoors") return "walk";
  if (c.activityType === "commute") return "commute";
  if (c.activityType === "errand") return "errands";
  return c.channel === "call" ? "call" : c.channel === "imessage" ? "texts" : "talk";
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function cadenceWords(days: number) {
  if (days <= 1) return "every day";
  if (days === 7) return "weekly";
  if (days === 14) return "every two weeks";
  if (days >= 28 && days <= 31) return "monthly";
  return `every ${days} days`;
}

/**
 * Mood section.
 * score = round(50 + 25 * m), m = minute-weighted mean of conversation mood (-2..2); 50 when no conversation has a mood.
 * curve = one point per conversation with a mood. facts = high (max mood, ties to the longest),
 * low (min mood, only when below the high), steady (mood 0 or 1 closest to m, not already used, ties to the earliest).
 */
export function moodSection(conversations: Conversation[], names: Map<Id<"people">, string>) {
  const rated = conversations.filter((c) => c.mood !== undefined).sort((a, b) => a.startedAt - b.startedAt);
  const m = weighted(rated, (c) => c.mood);
  const fact = (kind: "high" | "low" | "steady", c: Conversation) => {
    const people = c.participantIds.map((id) => names.get(id)?.split(" ")[0]).filter((n) => n !== undefined);
    const place = placeOf(c);
    const label = kind === "high" ? "High" : kind === "low" ? "Low" : "Steady";
    const where = people.length > 0 ? ` with ${joinNames(people)}` : place ? ` at ${place}` : "";
    return {
      kind,
      conversationId: c._id,
      at: c.startedAt,
      mood: c.mood ?? 0,
      personIds: c.participantIds,
      place,
      title: `${label}: ${activityNoun(c)}${where}`,
      reason: c.moodReason ?? c.summaryLine ?? "",
    };
  };
  const facts = [];
  const high = [...rated].sort((a, b) => b.mood! - a.mood! || talkMinutes(b) - talkMinutes(a))[0];
  if (high) facts.push(fact("high", high));
  const low = [...rated].sort((a, b) => a.mood! - b.mood! || talkMinutes(b) - talkMinutes(a))[0];
  if (high && low && low.mood! < high.mood!) facts.push(fact("low", low));
  const used = new Set(facts.map((f) => f.conversationId));
  const steady = rated
    .filter((c) => (c.mood === 0 || c.mood === 1) && !used.has(c._id))
    .sort((a, b) => Math.abs(a.mood! - (m ?? 0)) - Math.abs(b.mood! - (m ?? 0)) || a.startedAt - b.startedAt)[0];
  if (steady) facts.push(fact("steady", steady));
  return {
    score: m === undefined ? 50 : clamp(50 + 25 * m),
    curve: rated.map((c) => ({ at: c.startedAt, value: c.mood!, conversationId: c._id })),
    facts,
  };
}

/**
 * People section.
 * S = minutes of conversations with at least one participant; B = mean S over previous days (180 with no history).
 * score = clamp(round(60 * S / B + 5 * min(4, distinct people))).
 * split: each conversation's minutes go once to every relationship category among its participants.
 * facts: one per person with minutes together and minute-weighted mood, longest first.
 * nudge: the person not seen today with a cadence whose days since last contact (to the end of the day) most exceed 1.5 x cadence.
 */
export function peopleSection(
  conversations: Conversation[],
  people: Person[],
  topicLabels: Map<Id<"topics">, string>,
  history: PreviousDay[],
  dayEnd: number,
) {
  const byId = new Map(people.map((p) => [p._id, p]));
  const social = conversations.filter((c) => c.participantIds.length > 0);
  const totalMinutes = social.reduce((sum, c) => sum + talkMinutes(c), 0);
  const baseline = mean(history.map((d) => d.people.totalMinutes));
  const B = baseline !== undefined && baseline > 0 ? baseline : DEFAULT_BASELINE_MINUTES;
  const personIds = unique(social.flatMap((c) => c.participantIds));
  const split = { work: 0, friend: 0, family: 0, other: 0 };
  for (const c of social) {
    const kinds = unique(c.participantIds.map((id): Relationship => byId.get(id)?.relationship ?? "other"));
    for (const k of kinds) split[k] += talkMinutes(c);
  }
  const facts = personIds
    .map((personId) => {
      const theirs = social.filter((c) => c.participantIds.includes(personId));
      const longest = [...theirs].sort((a, b) => talkMinutes(b) - talkMinutes(a));
      const topics = unique(longest.flatMap((c) => (c.topicIds ?? []).map((id) => topicLabels.get(id)))).filter(
        (t) => t !== undefined,
      );
      return {
        personId,
        minutes: theirs.reduce((sum, c) => sum + talkMinutes(c), 0),
        mood: round1(weighted(theirs, (c) => c.mood) ?? 0),
        conversationIds: theirs.map((c) => c._id),
        reason: topics.length > 0 ? topics.slice(0, 3).join(", ") : (longest[0].summaryLine ?? ""),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const seen = new Set(personIds);
  let nudge: { person: Person; daysSince: number; excess: number } | undefined;
  for (const p of people) {
    const last = p.lastInteractionAt ?? p.lastSeenAt;
    if (p.cadenceDays === undefined || seen.has(p._id) || last > dayEnd) continue;
    const daysSince = Math.floor((dayEnd - last) / DAY);
    const excess = daysSince - p.cadenceDays * NUDGE_FACTOR;
    if (excess > 0 && (nudge === undefined || excess > nudge.excess)) nudge = { person: p, daysSince, excess };
  }
  return {
    score: clamp((60 * totalMinutes) / B + 5 * Math.min(4, personIds.length)),
    totalMinutes,
    personCount: personIds.length,
    split,
    facts,
    nudgePersonId: nudge?.person._id,
    nudgeReason: nudge
      ? `You haven't talked to ${nudge.person.name} in ${nudge.daysSince} days. You usually catch up ${cadenceWords(nudge.person.cadenceDays!)}.`
      : undefined,
  };
}

/**
 * Activity section.
 * P = distinct places, A = distinct activity types, outside = any outdoors or exercise,
 * focus = building/meeting conversations at one place, with gaps of 30 minutes or less, adding up to 120 minutes or more.
 * score = clamp(8 * min(P, 5) + 5 * min(A, 6) + 10 * outside + 10 * focus).
 * timeSplit = minutes by activityType (missing counts as other), longest first; talkSplit = minute-weighted mean topicMix.
 * facts: one per place with its dominant activityType, minutes and summary lines, longest first.
 */
export function activitySection(conversations: Conversation[]) {
  const minutesByType = (cs: Conversation[]) => {
    const totals = new Map<ActivityType, number>();
    for (const c of cs) totals.set(c.activityType ?? "other", (totals.get(c.activityType ?? "other") ?? 0) + talkMinutes(c));
    return [...totals.entries()].map(([activityType, minutes]) => ({ activityType, minutes })).sort((a, b) => b.minutes - a.minutes);
  };
  const talkSplit = {
    work: round2(weighted(conversations, (c) => c.topicMix?.work) ?? 0),
    personal: round2(weighted(conversations, (c) => c.topicMix?.personal) ?? 0),
    logistics: round2(weighted(conversations, (c) => c.topicMix?.logistics) ?? 0),
  };
  const places = unique(conversations.map(placeOf).filter((p) => p !== undefined));
  const facts = places
    .map((place) => {
      const here = conversations.filter((c) => placeOf(c) === place);
      const lines = unique([...here].sort((a, b) => talkMinutes(b) - talkMinutes(a)).map((c) => c.summaryLine)).filter(
        (s) => s !== undefined,
      );
      return {
        place,
        activityType: minutesByType(here)[0].activityType,
        minutes: here.reduce((sum, c) => sum + talkMinutes(c), 0),
        conversationIds: here.map((c) => c._id),
        reason: lines.slice(0, 2).join("; "),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const types = unique(conversations.map((c) => c.activityType).filter((t) => t !== undefined));
  const outside = types.includes("outdoors") || types.includes("exercise");
  let focus = false;
  let run: { place: string; minutes: number; end: number } | null = null;
  for (const c of [...conversations].sort((a, b) => a.startedAt - b.startedAt)) {
    const place = placeOf(c);
    if (place === undefined || (c.activityType !== "building" && c.activityType !== "meeting")) continue;
    const minutes = talkMinutes(c);
    const end = c.startedAt + minutes * MINUTE;
    const chained: boolean = run !== null && run.place === place && c.startedAt - run.end <= FOCUS_GAP_MS;
    run = { place, minutes: chained ? run!.minutes + minutes : minutes, end };
    if (run.minutes >= FOCUS_MINUTES) focus = true;
  }
  return {
    score: clamp(8 * Math.min(places.length, 5) + 5 * Math.min(types.length, 6) + (outside ? 10 : 0) + (focus ? 10 : 0)),
    timeSplit: minutesByType(conversations),
    talkSplit,
    facts,
  };
}

/**
 * The whole day row: every number, plus code-written fallback text so the row is complete without an LLM.
 * score = round(mean of the mood, people and activity scores). usual (day and each section) = mean over the
 * previous days in history, only once there are at least 7 data days including this one.
 */
export function computeDayScores({ conversations, people, topicLabels, history, dayEnd, dataDays }: DayInput): DayScores {
  const sorted = [...conversations].sort((a, b) => a.startedAt - b.startedAt);
  const names = new Map(people.map((p) => [p._id, p.name]));
  const mood = moodSection(sorted, names);
  const social = peopleSection(sorted, people, topicLabels, history, dayEnd);
  const activity = activitySection(sorted);
  const usual = (pick: (d: PreviousDay) => number) => {
    const m = dataDays < BASELINE_AFTER_DAYS ? undefined : mean(history.map(pick));
    return m === undefined ? undefined : Math.round(m);
  };
  const totalMinutes = sorted.reduce((sum, c) => sum + talkMinutes(c), 0);
  const topPerson = social.facts[0] ? names.get(social.facts[0].personId) : undefined;
  const topActivity = activity.timeSplit[0]?.activityType ?? "other";
  const topPlace = activity.facts[0]?.place;
  const high = mood.facts.find((f) => f.kind === "high");
  const low = mood.facts.find((f) => f.kind === "low");
  const topKind = (Object.entries(social.split) as [Relationship, number][]).sort((a, b) => b[1] - a[1])[0][0];
  const kindWords = { work: "work", friend: "friends", family: "family", other: "other people" };
  const take = [high ? `${high.title}.` : null, low ? `${low.title}.` : null].filter((s) => s !== null).join(" ");
  return {
    score: Math.round((mood.score + social.score + activity.score) / 3),
    usual: usual((d) => d.score),
    headline: `A ${topActivity} day${topPerson ? `, mostly with ${topPerson}` : ""}`,
    take: take || `${sorted.length} conversations.`,
    mood: {
      ...mood,
      usual: usual((d) => d.mood.score),
      desc: `Mood averaged ${mood.score} across ${mood.curve.length} conversations.`,
    },
    people: {
      ...social,
      usual: usual((d) => d.people.score),
      desc:
        social.personCount === 0
          ? "No time with people."
          : `${formatMinutes(social.totalMinutes)} with ${social.personCount} ${social.personCount === 1 ? "person" : "people"}, mostly ${kindWords[topKind]}.`,
    },
    activity: {
      ...activity,
      usual: usual((d) => d.activity.score),
      desc: `${formatMinutes(totalMinutes)} across ${activity.facts.length} ${activity.facts.length === 1 ? "place" : "places"}, mostly ${topActivity}${topPlace ? ` at ${topPlace}` : ""}.`,
    },
    conversationIds: sorted.map((c) => c._id),
    dataDays,
  };
}
