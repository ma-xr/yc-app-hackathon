import type { Id } from "../_generated/dataModel";

export type LiftDay = {
  date: string;
  score: number;
  people: { personId: Id<"people">; name: string }[];
  places: string[];
  activityTypes: string[];
};

type Kind = "person" | "place" | "activityType";

export type Lift = {
  kind: Kind;
  key: string;
  label: string;
  personId?: Id<"people">;
  delta: number;
  withAvg: number;
  withoutAvg: number;
  withDays: string[];
  note: string;
};

const MIN_DAYS = 5;
const MIN_WITH = 3;
const MIN_WITHOUT = 3;
const ACTIVITY: Record<string, { label: string; phrase: string }> = {
  building: { label: "Building", phrase: "on building days" },
  meeting: { label: "Lots of meetings", phrase: "on days with meetings" },
  meal: { label: "Meals out", phrase: "on days you eat out with someone" },
  social: { label: "Social time", phrase: "on social days" },
  exercise: { label: "Exercise", phrase: "on days you exercise" },
  outdoors: { label: "Getting outside", phrase: "on days you get outside" },
  commute: { label: "Commuting", phrase: "on days you commute" },
  errand: { label: "Errands", phrase: "on errand days" },
  other: { label: "Other", phrase: "on other days" },
};
const MIN_DELTA = 8;

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function note(kind: Kind, label: string, withAvg: number, withoutAvg: number) {
  const prefix = `Your average day score is ${withAvg}`;
  if (kind === "person") return `${prefix} with ${label} and ${withoutAvg} without`;
  if (kind === "place") return `${prefix} on days at ${label} and ${withoutAvg} on other days`;
  return `${prefix} ${ACTIVITY[label]?.phrase ?? `on days with ${label}`} and ${withoutAvg} without`;
}

export function computeLifts(days: LiftDay[]): Lift[] {
  if (days.length < MIN_DAYS) return [];
  const candidates = new Map<string, { kind: Kind; key: string; label: string; personId?: Id<"people">; dates: Set<string> }>();
  const add = (kind: Kind, key: string, label: string, date: string, personId?: Id<"people">) => {
    const id = `${kind}:${key}`;
    const entry = candidates.get(id) ?? { kind, key, label, personId, dates: new Set<string>() };
    entry.dates.add(date);
    candidates.set(id, entry);
  };
  for (const day of days) {
    for (const p of day.people) add("person", p.personId, p.name, day.date, p.personId);
    for (const place of day.places) add("place", place, place, day.date);
    for (const type of day.activityTypes) add("activityType", type, type, day.date);
  }
  const lifts: Lift[] = [];
  for (const c of candidates.values()) {
    const withScores = days.filter((d) => c.dates.has(d.date)).map((d) => d.score);
    const withoutScores = days.filter((d) => !c.dates.has(d.date)).map((d) => d.score);
    if (withScores.length < MIN_WITH || withoutScores.length < MIN_WITHOUT) continue;
    const delta = Math.round(mean(withScores) - mean(withoutScores));
    if (Math.abs(delta) < MIN_DELTA) continue;
    const withAvg = Math.round(mean(withScores));
    const withoutAvg = Math.round(mean(withoutScores));
    lifts.push({
      kind: c.kind,
      key: c.key,
      label: c.kind === "activityType" ? (ACTIVITY[c.label]?.label ?? c.label) : c.kind === "person" ? `Days with ${c.label}` : `Days at ${c.label}`,
      ...(c.personId ? { personId: c.personId } : {}),
      delta,
      withAvg,
      withoutAvg,
      withDays: [...c.dates].sort(),
      note: note(c.kind, c.label, withAvg, withoutAvg),
    });
  }
  const byStrength = (a: Lift, b: Lift) => Math.abs(b.delta) - Math.abs(a.delta) || a.label.localeCompare(b.label);
  const positive = lifts.filter((l) => l.delta > 0).sort(byStrength).slice(0, 2);
  const negative = lifts.filter((l) => l.delta < 0).sort(byStrength).slice(0, 1);
  return [...positive, ...negative];
}
