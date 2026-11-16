import type { ContactSort, ContactSummary } from '@/components/contacts/data';

export type { ContactSort };

export type SortOption = { key: ContactSort; label: string; short: string; description: string };

export const SORT_GROUPS: { title: string; options: SortOption[] }[] = [
  {
    title: 'Sort',
    options: [
      { key: 'recent', label: 'Recent', short: 'Recent', description: 'Who you saw or spoke to last' },
      { key: 'time', label: 'Most time together', short: 'Time together', description: 'Total hours spent together' },
      { key: 'deepest', label: 'Deepest', short: 'Deepest', description: 'The most different topics you cover' },
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

const SCORE: Partial<Record<ContactSort, { field: keyof ContactSummary; label: string }>> = {
  fun: { field: 'funScore', label: 'Fun' },
  compatible: { field: 'compatibilityScore', label: 'Compatibility' },
  deepTalk: { field: 'deepTalkScore', label: 'Deep talk' },
};

export function metricFor(sort: ContactSort, row: ContactSummary, now: number): Metric {
  if (sort === 'recent') {
    const text = row.lastInteractionAt === undefined ? '—' : ago(row.lastInteractionAt, now);
    return { kind: 'text', text, label: row.lastInteractionAt === undefined ? 'Not seen yet' : `Last seen ${text}` };
  }
  if (sort === 'time') {
    const text = duration(row.totalMinutes);
    return { kind: 'text', text, label: `${text} together` };
  }
  if (sort === 'deepest') {
    return { kind: 'text', text: `${row.distinctTopicCount} topics`, label: `${row.distinctTopicCount} different topics` };
  }
  if (sort === 'encounters') {
    return { kind: 'text', text: `${row.encounterCount}×`, label: `${row.encounterCount} encounters` };
  }
  const score = SCORE[sort]!;
  const value = row[score.field] as number;
  return { kind: 'meter', value: value / 20, label: `${score.label} ${value} of 100` };
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
