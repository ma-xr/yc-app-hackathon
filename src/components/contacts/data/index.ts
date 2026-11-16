import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useMemo, useState } from 'react';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { useNow } from '@/data/hooks';

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

const FIXTURE = __DEV__ && process.env.EXPO_PUBLIC_CONTACTS_FIXTURE === '1';
const AVATAR_BY_NAME = new Map(MOCK_CONTACTS.filter((c) => c.avatarKey).map((c) => [c.name.toLowerCase(), c.avatarKey!]));
const ROLE: Record<Relationship, string> = { work: 'Work', friend: 'Friend', family: 'Family', other: 'Contact' };
const API_SORT = { recent: 'recent', time: 'time', deepest: 'deepest', encounters: 'recent', fun: 'fun', compatible: 'compatibility', deepTalk: 'deepTalk' } as const;

type Row = FunctionReturnType<typeof api.contacts.list>[number];
type Detail = NonNullable<FunctionReturnType<typeof api.contacts.get>>;
type Moment = Detail['conversations'][number];

function summary(r: Row): ContactSummary {
  const relationship = r.relationship ?? 'other';
  const roleLabel = r.roleLabel ?? r.relationshipSummary?.split(' · ')[0] ?? ROLE[relationship];
  return {
    id: r._id,
    name: r.name,
    avatarKey: r.avatarKey ?? AVATAR_BY_NAME.get(r.name.toLowerCase()),
    photoUrl: r.photoUrl,
    relationship,
    roleLabel,
    relationshipSummary: r.relationshipSummary ?? roleLabel,
    lastInteractionAt: r.lastInteractionAt || undefined,
    totalMinutes: r.totalMinutes,
    encounterCount: r.encounterCount,
    distinctTopicCount: r.distinctTopicCount,
    funScore: r.funScore ?? 0,
    compatibilityScore: r.compatibilityScore ?? 0,
    deepTalkScore: r.deepTalkScore ?? 0,
  };
}

const CHANNEL: Record<Moment['channel'], Channel> = { voice: 'in_person', call: 'call', imessage: 'text', email: 'text' };

function record(m: Moment): ConversationRecord {
  const title = m.summaryLine ?? m.gist[0] ?? (m.activityType ? `${m.activityType[0].toUpperCase()}${m.activityType.slice(1)}` : 'Conversation');
  return {
    id: m._id,
    startedAt: m.startedAt,
    minutes: m.minutes,
    channel: CHANNEL[m.channel],
    placeName: m.place ?? undefined,
    title,
    topics: m.topics.slice(0, 4),
    mood: m.mood ?? 0,
    points: [...m.gist.filter((g) => g !== title), ...(m.moodReason ? [m.moodReason] : [])].slice(0, 4),
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseBirthday(text: string) {
  const lower = text.toLowerCase();
  const month = MONTHS.findIndex((m) => lower.includes(m)) + 1;
  const day = Number(lower.match(/\b(\d{1,2})(st|nd|rd|th)?\b/)?.[1]);
  const year = Number(lower.match(/\b(19|20)\d{2}\b/)?.[0]);
  if (!month || !day || day > 31) return undefined;
  return { month, day, ...(year ? { year } : {}) };
}

function profileOf(detail: Detail): { profile: ContactProfile; history: ConversationRecord[] } {
  const p = detail.person;
  const history = detail.conversations
    .map(record)
    .filter((c) => c.channel === 'text' || c.minutes >= 3);
  const byId = new Map(detail.conversations.map((m) => [m._id as string, m]));
  const fact = (f?: { text: string; conversationIds: Id<'conversations'>[] }): Fact | undefined => {
    if (!f) return undefined;
    const m = f.conversationIds.map((id) => byId.get(id)).find((x) => x !== undefined);
    return m ? { text: f.text, source: { title: record(m).title, at: m.startedAt } } : { text: f.text };
  };
  const facts = (list?: { text: string; conversationIds: Id<'conversations'>[] }[]) => (list ?? []).map((f) => fact(f)!);
  const placeCounts = new Map<string, number>();
  for (const m of detail.conversations) if (m.place) placeCounts.set(m.place, (placeCounts.get(m.place) ?? 0) + 1);
  const places = [...placeCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([text, n]) => ({ text: `${text} · ${n} times` }));
  const oldest = detail.conversations.at(-1)?.startedAt;
  return {
    profile: {
      ...summary(p),
      phones: p.phones?.length ? p.phones : p.phone ? [p.phone] : [],
      emails: p.emails ?? [],
      birthday: p.birthday ? parseBirthday(p.birthday.text) : undefined,
      birthdayText: fact(p.birthday),
      knownSince: oldest,
      from: fact(p.from),
      workingOn: fact(p.workingOn),
      interests: facts(p.interests),
      whatMatters: facts(p.whatMatters),
      howWeMet: fact(p.howWeMet),
      family: facts(p.family),
      lifeEvents: facts(p.lifeEvents),
      places,
      giftIdeas: facts(p.giftIdeas),
      food: [],
      avoid: [],
      openPromises: (p.openPromises ?? []).map((o) => ({ direction: o.direction === 'you_owe' ? 'you' : 'they', text: o.text })),
    },
    history,
  };
}

export function useContacts(sort: ContactSort): ContactSummary[] | undefined {
  const rows = useQuery(api.contacts.list, FIXTURE ? 'skip' : { sort: API_SORT[sort] });
  return useMemo(() => {
    const value = SORT_VALUE[sort];
    const list = FIXTURE ? [...CONTACTS.values()].map((c) => c.profile) : rows?.map(summary);
    if (!list) return undefined;
    return [...list].sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name));
  }, [rows, sort]);
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
  const rows = useQuery(api.contacts.list, FIXTURE ? 'skip' : { sort: 'recent' });
  const now = useNow();
  const live = useMemo(() => {
    if (FIXTURE || rows === undefined) return undefined;
    const list = rows.map(summary);
    const focus = list
      .filter((c) => c.lastInteractionAt !== undefined && now - c.lastInteractionAt < 7 * DAY)
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 5)
      .map((contact) => {
        const days = Math.floor((now - contact.lastInteractionAt!) / DAY);
        return { contact, reason: days === 0 ? 'Talked today' : days === 1 ? 'Talked yesterday' : `Talked ${days} days ago` };
      });
    return { total: list.length, lastSyncedAt: null, focus };
  }, [rows, now]);
  const fixture = useMemo(() => {
    if (!FIXTURE) return undefined;
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
  return FIXTURE ? fixture : live;
}

function useDetail(id: string) {
  const detail = useQuery(api.contacts.get, FIXTURE ? 'skip' : { personId: id as Id<'people'> });
  return useMemo(() => {
    if (FIXTURE) return CONTACTS.get(id) ?? null;
    return detail === undefined ? undefined : profileOf(detail);
  }, [detail, id]);
}

export function useContact(id: string): ContactProfile | null | undefined {
  const built = useDetail(id);
  return built === undefined ? undefined : (built?.profile ?? null);
}

export function useContactHistory(id: string) {
  const [count, setCount] = useState(PAGE);
  const all = useDetail(id)?.history ?? NONE;
  const results = useMemo(() => all.slice(0, count), [all, count]);
  return {
    results,
    status: count >= all.length ? ('Exhausted' as const) : ('CanLoadMore' as const),
    loadMore: (n: number = PAGE) => setCount((c) => c + n),
  };
}
