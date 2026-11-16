import { useMemo, useState } from 'react';

import { MOCK_CONTACTS } from './mock-data';
import type {
  Channel,
  ContactProfile,
  ContactSort,
  ContactSummary,
  ContactsOverview,
  ConversationRecord,
  Fact,
  MockContact,
  Relationship,
} from './types';

export type * from './types';

const LOADED_AT = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const PAGE = 20;
const NONE: ConversationRecord[] = [];

type Built = { profile: ContactProfile; history: ConversationRecord[] };

function build(raw: MockContact): Built {
  const at = (ago: number) => LOADED_AT - ago;
  const fact = (f?: MockContact['interests'][number]): Fact | undefined =>
    f && { text: f.text, ...(f.source ? { source: { title: f.source.title, at: at(f.source.ago) } } : {}) };
  const facts = (list: MockContact['interests']) => list.map((f) => fact(f)!);
  const profile: ContactProfile = {
    id: raw.id,
    name: raw.name,
    avatarKey: raw.avatarKey,
    photoUrl: null,
    relationship: raw.relationship as Relationship,
    roleLabel: raw.roleLabel,
    relationshipSummary: raw.relationshipSummary,
    lastInteractionAt: raw.lastAgo === undefined ? undefined : at(raw.lastAgo),
    totalMinutes: raw.totalMinutes,
    encounterCount: raw.encounterCount,
    distinctTopicCount: raw.distinctTopicCount,
    funScore: raw.funScore,
    compatibilityScore: raw.compatibilityScore,
    deepTalkScore: raw.deepTalkScore,
    phones: raw.phones,
    emails: raw.emails,
    birthday: raw.birthday,
    knownSince: raw.knownAgo === undefined ? undefined : at(raw.knownAgo),
    from: fact(raw.from),
    workingOn: fact(raw.workingOn),
    interests: facts(raw.interests),
    whatMatters: facts(raw.whatMatters),
    howWeMet: fact(raw.howWeMet),
    family: facts(raw.family),
    lifeEvents: facts(raw.lifeEvents),
    places: facts(raw.places),
    giftIdeas: facts(raw.giftIdeas),
    style: fact(raw.style),
    food: facts(raw.food),
    avoid: facts(raw.avoid),
    openPromises: raw.openPromises.map((p) => ({
      direction: p.direction === 'you' ? 'you' : 'they',
      text: p.text,
      ...(p.dueIn === undefined ? {} : { dueAt: LOADED_AT + p.dueIn }),
    })),
  };
  const history = raw.conversations.map((c) => ({
    id: c.id,
    startedAt: at(c.ago),
    minutes: c.minutes,
    channel: c.channel as Channel,
    placeName: c.placeName ?? undefined,
    title: c.title,
    topics: c.topics,
    mood: c.mood,
    points: c.points,
  }));
  return { profile, history };
}

const CONTACTS = new Map(MOCK_CONTACTS.map((raw) => [raw.id, build(raw)]));

const SORT_VALUE: Record<ContactSort, (c: ContactSummary) => number> = {
  recent: (c) => c.lastInteractionAt ?? -1,
  time: (c) => c.totalMinutes,
  deepest: (c) => c.distinctTopicCount,
  encounters: (c) => c.encounterCount,
  fun: (c) => c.funScore,
  compatible: (c) => c.compatibilityScore,
  deepTalk: (c) => c.deepTalkScore,
};

export function useContacts(sort: ContactSort): ContactSummary[] | undefined {
  return useMemo(() => {
    const value = SORT_VALUE[sort];
    return [...CONTACTS.values()]
      .map((c) => c.profile)
      .sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name));
  }, [sort]);
}

export function nextBirthdayInDays(birthday: ContactProfile['birthday'], now: number) {
  if (!birthday) return null;
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  let next = new Date(today.getFullYear(), birthday.month - 1, birthday.day).getTime();
  if (next < start) next = new Date(today.getFullYear() + 1, birthday.month - 1, birthday.day).getTime();
  return Math.round((next - start) / DAY);
}

export function useContactsOverview(): ContactsOverview | undefined {
  return useMemo(() => {
    const ranked = [...CONTACTS.values()].map(({ profile, history }) => {
      const recent = history.filter((c) => LOADED_AT - c.startedAt < 7 * DAY);
      const fortnight = history.filter((c) => LOADED_AT - c.startedAt < 14 * DAY);
      const birthdayIn = nextBirthdayInDays(profile.birthday, LOADED_AT);
      const owe = profile.openPromises.find((p) => p.direction === 'you');
      let score = fortnight.reduce((s, c) => s + Math.min(c.minutes, 180) * (c.mood + 3), 0);
      let reason = recent.length > 1 ? `${recent.length} talks this week` : recent.length === 1 ? 'Talked this week' : 'Talked recently';
      if (owe) {
        score += 400;
        reason = `You owe: ${owe.text}`;
      }
      if (birthdayIn !== null && birthdayIn <= 7) {
        score += 900 - birthdayIn * 60;
        reason = birthdayIn === 0 ? 'Birthday today' : birthdayIn === 1 ? 'Birthday tomorrow' : `Birthday in ${birthdayIn} days`;
      }
      return { contact: profile as ContactSummary, reason, score };
    });
    return {
      total: CONTACTS.size,
      lastSyncedAt: LOADED_AT - 2 * 60 * 1000,
      focus: ranked
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ contact, reason }) => ({ contact, reason })),
    };
  }, []);
}

export function useContact(id: string): ContactProfile | null | undefined {
  return CONTACTS.get(id)?.profile ?? null;
}

export function useContactHistory(id: string) {
  const [count, setCount] = useState(PAGE);
  const all = CONTACTS.get(id)?.history ?? NONE;
  const results = useMemo(() => all.slice(0, count), [all, count]);
  return {
    results,
    status: count >= all.length ? ('Exhausted' as const) : ('CanLoadMore' as const),
    loadMore: (n: number = PAGE) => setCount((c) => c + n),
  };
}
