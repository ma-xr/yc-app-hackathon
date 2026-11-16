import type { FunctionArgs, FunctionReturnType } from 'convex/server';

import type { api } from '../../../../convex/_generated/api';

export type ContactSort = FunctionArgs<typeof api.contacts.list>['sort'];
export type ContactRowData = FunctionReturnType<typeof api.contacts.list>[number];
export type ContactsOverview = FunctionReturnType<typeof api.contacts.overview>;

export type SortOption = { key: ContactSort; label: string; short: string; description: string };

export const SORT_GROUPS: { title: string; options: SortOption[] }[] = [
  {
    title: 'Sort',
    options: [
      { key: 'recent', label: 'Recent', short: 'Recent', description: 'Who you saw or spoke to last' },
      { key: 'time', label: 'Time together', short: 'Time together', description: 'Total hours spent together' },
      { key: 'deepest', label: 'Deepest', short: 'Deepest', description: 'Conversations that went furthest' },
      { key: 'encounters', label: 'Encounters', short: 'Encounters', description: 'How often your paths cross' },
    ],
  },
  {
    title: 'Vibe',
    options: [
      { key: 'fun', label: 'Most fun', short: 'Most fun', description: 'Who you laugh with the most' },
      { key: 'compatible', label: 'Most compatible', short: 'Compatible', description: 'Shared interests, easy rhythm' },
      { key: 'deepTalk', label: 'Great for deep talk', short: 'Deep talk', description: 'Who you open up with' },
    ],
  },
];

export const SORT_OPTIONS = SORT_GROUPS.flatMap((g) => g.options);

export type Metric = { kind: 'text'; text: string; label: string } | { kind: 'meter'; value: number; label: string };

const SCORE: Partial<Record<ContactSort, { field: keyof ContactRowData; label: string }>> = {
  deepest: { field: 'depthScore', label: 'Depth' },
  fun: { field: 'funScore', label: 'Fun' },
  compatible: { field: 'compatibilityScore', label: 'Compatibility' },
  deepTalk: { field: 'deepTalkScore', label: 'Deep talk' },
};

export function metricFor(sort: ContactSort, row: ContactRowData, now: number): Metric {
  if (sort === 'recent') {
    const text = row.lastInteractionAt === undefined ? '—' : ago(row.lastInteractionAt, now);
    return { kind: 'text', text, label: row.lastInteractionAt === undefined ? 'Not seen yet' : `Last seen ${text}` };
  }
  if (sort === 'time') {
    const text = duration(row.totalMinutes);
    return { kind: 'text', text, label: `${text} together` };
  }
  if (sort === 'encounters') {
    return { kind: 'text', text: `${row.encounterCount}×`, label: `${row.encounterCount} encounters` };
  }
  const score = SCORE[sort]!;
  const value = row[score.field] as number;
  return { kind: 'meter', value, label: `${score.label} ${value.toFixed(1)} of 5` };
}

export function ago(ms: number, now: number) {
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 60) return min < 2 ? 'now' : `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 35) return `${Math.round(d / 7)}w ago`;
  if (d < 365) return `${Math.round(d / 30)}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

export function duration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = minutes / 60;
  return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)} h`;
}

export function syncedLabel(lastSyncedAt: number | null, now: number) {
  if (lastSyncedAt === null) return 'Synced with Contacts';
  const min = Math.round((now - lastSyncedAt) / 60_000);
  if (min < 1) return 'Synced just now';
  if (min < 60) return `Synced ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `Synced ${h} h ago`;
  return `Synced ${Math.round(h / 24)} d ago`;
}
