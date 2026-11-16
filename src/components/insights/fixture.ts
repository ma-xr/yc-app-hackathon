import type { Id } from '../../../convex/_generated/dataModel';
import type { Day, Moment, Profile, WeekDay } from '@/components/insights/types';

const cid = (n: number) => `fixture_c${n}` as Id<'conversations'>;
const pid = (n: string) => `fixture_p_${n}` as Id<'people'>;
const tid = (n: number) => `fixture_t${n}` as Id<'traits'>;

function at(date: string, hour: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(hour), Math.round((hour % 1) * 60)).getTime();
}

function shift(date: string, days: number) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + days);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const PEOPLE = {
  max: { _id: pid('max'), name: 'Max', roleLabel: 'Co-founder', relationship: 'work' as const, cadenceDays: 1 },
  priya: { _id: pid('priya'), name: 'Priya Raman', roleLabel: 'Friend', relationship: 'friend' as const, cadenceDays: 7 },
  tomas: { _id: pid('tomas'), name: 'Tomás Herrera', roleLabel: 'Advisor', relationship: 'work' as const, cadenceDays: 14 },
  wen: { _id: pid('wen'), name: 'Wen Liu', roleLabel: 'New this week', relationship: 'work' as const, cadenceDays: null },
  mom: { _id: pid('mom'), name: 'Mom', roleLabel: 'Family', relationship: 'family' as const, cadenceDays: 3 },
  aoife: { _id: pid('aoife'), name: 'Aoife Byrne', roleLabel: 'Friend', relationship: 'friend' as const, cadenceDays: 7 },
};

type P = (typeof PEOPLE)[keyof typeof PEOPLE];
const brief = (p: P, date: string) => ({ ...p, lastInteractionAt: at(date, 12) });
const tag = (p: P) => ({ _id: p._id, name: p.name, roleLabel: p.roleLabel });

const SCORES = [62, 58, 71, 49, 66, 80, 74];

export function fixtureWeek(endDate: string, newUser: boolean): WeekDay[] {
  return SCORES.map((score, i) => ({ date: shift(endDate, i - 6), score: newUser && i < 5 ? null : score }));
}

function timeline(date: string): Moment[] {
  const row = (
    n: number,
    hour: number,
    minutes: number,
    place: string,
    people: P[],
    topics: string[],
    mood: number,
    activityType: Moment['activityType'],
    summaryLine: string,
    channel: Moment['channel'] = 'voice',
  ): Moment => ({
    _id: cid(n),
    startedAt: at(date, hour),
    endedAt: at(date, hour) + minutes * 60_000,
    minutes,
    place,
    channel,
    people: people.map(tag),
    topics,
    gist: [summaryLine],
    mood,
    moodReason: null,
    energy: mood > 0 ? 'high' : 'medium',
    activityType,
    summaryLine,
  });
  return [
    row(1, 9.5, 45, 'Café Réveille', [PEOPLE.tomas], ['pre-seed round', 'pitch deck'], 1, 'meeting', 'Pitch deck feedback, two follow-ups'),
    row(2, 11, 150, 'YC hackathon', [PEOPLE.max, PEOPLE.wen], ['Expo build', 'Convex schema'], 1, 'building', 'Expo build and the Convex schema'),
    row(3, 13 + 40 / 60, 60, 'Tartine', [PEOPLE.priya], ['climbing trip', 'her new job'], 2, 'meal', 'Laughing about the climbing trip'),
    row(4, 15, 90, 'YC hackathon', [PEOPLE.max], ['demo plan', 'deadline'], -1, 'building', 'Demo crunch, talking over each other'),
    row(5, 19 + 10 / 60, 25, 'Dolores Park', [PEOPLE.mom], ['visa paperwork', 'Thanksgiving'], 0, 'outdoors', 'Walk and a call with Mom', 'call'),
  ];
}

export function fixtureEvidence(ids: string[], today: string): Moment[] {
  return timeline(today)
    .filter((m) => ids.includes(m._id))
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function fixtureDay(date: string, today: string, newUser: boolean): Day | null {
  const i = 6 + Math.round((at(date, 12) - at(today, 12)) / 86_400_000);
  if (i < 0 || i > 6 || (newUser && i < 5)) return null;
  const score = SCORES[i];
  const isToday = i === 6;
  const usual = newUser ? undefined : 64;
  return {
    _id: `fixture_d${i}` as Id<'days'>,
    _creationTime: at(date, 23),
    ownerId: 'fixture_u' as Id<'users'>,
    date,
    score,
    usual,
    headline: isToday ? 'A social, productive build day with one stressful stretch' : 'A steady day, mostly heads-down',
    take: 'You spent most of the day heads-down with Max. Lunch with Priya was the clear high point, and the 3pm demo crunch was the low.',
    dataDays: newUser ? 2 : 7,
    baselineReady: !newUser,
    computedAt: at(date, 23),
    conversationIds: [1, 2, 3, 4, 5].map(cid),
    mood: {
      score: isToday ? 68 : score - 4,
      usual: newUser ? undefined : 61,
      desc: 'You started steady, peaked at lunch with Priya, dipped hard during the 3pm demo crunch, then settled on the evening call with your mom. Calmer overall than most of your build days.',
      curve: timeline(date).map((m) => ({ at: m.startedAt, value: m.mood ?? 0, conversationId: m._id })),
      facts: [
        { kind: 'high', conversationId: cid(3), at: at(date, 13 + 40 / 60), mood: 2, personIds: [PEOPLE.priya._id], place: 'Tartine', title: 'High: lunch with Priya', reason: 'Laughing about the climbing trip and her new job. Your most upbeat hour this week.' },
        { kind: 'low', conversationId: cid(4), at: at(date, 15), mood: -1, personIds: [PEOPLE.max._id], place: 'YC hackathon', title: 'Low: demo planning with Max', reason: 'Deadline pressure and talking over each other. Your mood dips most on deadline afternoons.' },
        { kind: 'steady', conversationId: cid(1), at: at(date, 9.5), mood: 1, personIds: [PEOPLE.tomas._id], place: 'Café Réveille', title: 'Steady: morning with Tomás', reason: 'Focused and hopeful while talking through the pre-seed deck.' },
      ],
    },
    people: {
      score: isToday ? 85 : score + 3,
      usual: newUser ? undefined : 62,
      desc: '6 hours with 4 people, mostly with your co-founder. Most of today was work. Priya was your only purely social time, and it was also your best hour.',
      totalMinutes: 370,
      personCount: 4,
      split: { work: 285, friend: 60, family: 25, other: 0 },
      facts: [
        { personId: PEOPLE.max._id, minutes: 240, mood: 0, conversationIds: [cid(2), cid(4)], reason: 'Expo build, demo plan. Productive, but tense by the afternoon.', person: brief(PEOPLE.max, date) },
        { personId: PEOPLE.priya._id, minutes: 60, mood: 2, conversationIds: [cid(3)], reason: "Climbing trip, her new job. You're consistently happiest around her.", person: brief(PEOPLE.priya, date) },
        { personId: PEOPLE.tomas._id, minutes: 45, mood: 1, conversationIds: [cid(1)], reason: 'Pitch deck feedback. You left with two follow-ups.', person: brief(PEOPLE.tomas, date) },
        { personId: PEOPLE.wen._id, minutes: 150, mood: 1, conversationIds: [cid(2)], reason: 'Convex schema. First long conversation together.', person: brief(PEOPLE.wen, date) },
      ],
      nudgePersonId: newUser ? undefined : PEOPLE.aoife._id,
      nudgeReason: newUser ? undefined : "You haven't talked to Aoife in 12 days. You usually catch up weekly.",
      nudge: newUser ? null : { ...PEOPLE.aoife, lastInteractionAt: at(date, 12) - 12 * 86_400_000 },
    },
    activity: {
      score: isToday ? 70 : score - 2,
      usual: newUser ? undefined : 64,
      desc: "Mostly deep work at the YC hackathon, about 4 hours in one place. You covered 4 spots in the Mission and got outside once, but didn't exercise.",
      timeSplit: [
        { activityType: 'building', minutes: 240 },
        { activityType: 'meal', minutes: 105 },
        { activityType: 'outdoors', minutes: 25 },
      ],
      talkSplit: { work: 0.6, personal: 0.25, logistics: 0.15 },
      facts: [
        { place: 'YC hackathon', activityType: 'building', minutes: 240, conversationIds: [cid(2), cid(4)], reason: 'Expo build, Convex schema, demo plan. Your longest focus block this week.' },
        { place: 'Tartine', activityType: 'meal', minutes: 60, conversationIds: [cid(3)], reason: 'Lunch with Priya. You talked about climbing, not work, for the first time today.' },
        { place: 'Café Réveille', activityType: 'meeting', minutes: 45, conversationIds: [cid(1)], reason: 'Pitch deck with Tomás. Second fundraising conversation this week.' },
        { place: 'Dolores Park', activityType: 'outdoors', minutes: 25, conversationIds: [cid(5)], reason: 'Call with your mom while walking. Your only time outside today.' },
      ],
    },
    timeline: timeline(date),
  };
}

export function fixtureProfile(today: string, newUser: boolean): Profile {
  const trait = (
    n: number,
    kind: 'interest' | 'goal' | 'personality',
    label: string,
    reason: string,
    evidenceCount: number,
    told = false,
  ) => ({
    _id: tid(n),
    _creationTime: at(today, 8),
    ownerId: 'fixture_u' as Id<'users'>,
    kind,
    label,
    reason,
    source: told ? ('told' as const) : ('learned' as const),
    evidenceCount,
    evidence: told ? [] : [cid(2), cid(3), cid(1)],
    confidence: 0.8,
    lastSeenAt: at(today, 12),
    toldAt: told ? at(shift(today, -2), 10) : undefined,
    removed: false,
  });
  const interests = [
    trait(1, 'interest', 'AI agents', 'Your most-discussed topic this month, mostly with Max and Wen. Your mood rises when it comes up.', 14),
    trait(2, 'interest', 'Startups', 'Fundraising, pitch decks and founder stories. It comes up with almost everyone you talk to.', 11),
    trait(3, 'interest', 'Climbing', 'Weekly sessions with Priya at Mission Cliffs. These are among your best-mood moments.', 6),
    trait(4, 'interest', 'Film photography', "You said you shoot on a Pentax. It hasn't come up in conversation yet.", 0, true),
  ];
  const goals = [
    trait(5, 'goal', 'Ship Jesse at the hackathon', 'You set this two days ago. It took about 70% of your talk time today.', 0, true),
    trait(6, 'goal', 'Raise a pre-seed round', 'Came up with Tomás, Max and Priya. You mentioned a December target twice.', 5),
    trait(7, 'goal', 'Climb V5 by spring', 'You mention projecting V4s with Priya most weeks.', 3),
  ];
  const personality = [
    trait(8, 'personality', 'Energized by one-on-ones', 'Your mood is 18 points higher in one-on-one conversations than in groups of three or more.', 21),
    trait(9, 'personality', 'Plans out loud', '7 of your 9 goals first came up mid-conversation, not when you were alone.', 9),
    trait(10, 'personality', 'Night owl', 'Your longest, most upbeat conversations start after 8pm.', 8),
  ];
  const days = [5, 2, 4].map((d) => shift(today, -d));
  return {
    dataDays: newUser ? 2 : 7,
    liftsReady: !newUser,
    identity: newUser
      ? 'Too early to say much. So far: you build things and talk a lot about AI.'
      : 'A builder who lights up talking about AI and climbing, and does his best thinking out loud with one other person.',
    lifts: newUser
      ? []
      : [
          { kind: 'person', key: 'priya', label: 'Days with Priya', personId: PEOPLE.priya._id, delta: 17, withAvg: 81, withoutAvg: 64, withDays: days, note: 'Your average day score is 81 with her and 64 without' },
          { kind: 'activityType', key: 'outdoors', label: 'Getting outside', delta: 12, withAvg: 76, withoutAvg: 64, withDays: days, note: '4 of your 5 best days included time outdoors' },
          { kind: 'activityType', key: 'meeting', label: '3+ hours of meetings', delta: -14, withAvg: 52, withoutAvg: 66, withDays: days, note: 'Your mood drops after 3pm on these days' },
        ],
    interests: newUser ? interests.slice(0, 1) : interests,
    goals: newUser ? goals.slice(0, 1) : goals,
    personality: newUser ? [] : personality,
    orbit: [
      { ...PEOPLE.max, minutes: 570, about: ['Jesse', 'the demo', 'fundraising'] },
      { ...PEOPLE.priya, minutes: 240, about: ['Climbing', 'her new job', 'travel'] },
      { ...PEOPLE.tomas, minutes: 150, about: ['Pre-seed round', 'the pitch'] },
      { ...PEOPLE.wen, roleLabel: 'Engineer friend', minutes: 120, about: ['Convex', 'side projects'] },
    ].map(({ cadenceDays: _c, ...o }) => o),
  };
}
