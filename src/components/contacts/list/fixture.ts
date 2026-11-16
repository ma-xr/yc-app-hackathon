import type { Id } from '../../../../convex/_generated/dataModel';
import type { ContactRowData, ContactSort, ContactsOverview } from '@/components/contacts/list/sort';

export const CONTACTS_FIXTURE = process.env.EXPO_PUBLIC_CONTACTS_FIXTURE === '1';

const H = 3_600_000;
const D = 24 * H;

const RAW: [string, string | null, string | null, number, number, number, number, number, number, number][] = [
  ['Maya Lindqvist', 'Shipping a ceramics studio app', 'Close friend', 5 * H, 2680, 61, 4.7, 4.5, 4.6, 4.8],
  ['Daniel Okafor', 'Raising a seed round for Fieldnote', 'Former cofounder', 1.2 * D, 1820, 44, 4.4, 3.9, 4.2, 4.5],
  ['Priya Raman', 'Training for the Big Sur marathon', 'Sister', 2 * D, 5400, 112, 4.9, 4.6, 4.8, 4.9],
  ['Theo Marchetti', 'Learning to make fresh pasta', 'Climbing partner', 3 * D, 940, 38, 3.2, 4.9, 4.1, 2.8],
  ['Hana Sato', 'Moving back to Kyoto in spring', 'College roommate', 6 * D, 3100, 70, 4.5, 4.2, 4.4, 4.6],
  ['Jonah Weiss', null, 'Neighbor', 9 * D, 210, 27, 2.1, 3.4, 2.9, 1.8],
  ['Sofia Herrera', 'Designing a type foundry', 'Mentor', 12 * D, 760, 15, 4.6, 3.1, 4.0, 4.7],
  ['Marcus Bell', 'Coaching his kid’s soccer team', 'Old teammate', 19 * D, 430, 22, 2.7, 4.4, 3.3, 2.2],
  ['Ines Duarte', 'Writing a book on attention', 'Book club', 26 * D, 380, 11, 4.1, 3.6, 3.8, 4.3],
  ['Kofi Mensah', 'Opening a coffee bar in the Mission', 'Friend of Maya', 41 * D, 150, 6, 2.9, 3.8, 3.1, 2.6],
  ['Elena Park', null, 'Dentist', 120 * D, 45, 3, 1.2, 1.5, 1.4, 1.0],
  ['Sam Whitaker', 'Restoring a 1972 Bronco', 'Cousin', 210 * D, 900, 19, 3.0, 4.0, 3.2, 2.5],
];

export function fixtureList(sort: ContactSort, now: number): ContactRowData[] {
  const rows: ContactRowData[] = RAW.map((r, i) => ({
    _id: `fixture${i}` as Id<'people'>,
    name: r[0],
    headline: r[1],
    relationship: r[2],
    photoUrl: null,
    lastInteractionAt: now - r[3],
    totalMinutes: r[4],
    encounterCount: r[5],
    depthScore: r[6],
    funScore: r[7],
    compatibilityScore: r[8],
    deepTalkScore: r[9],
  }));
  const key: Record<ContactSort, (r: ContactRowData) => number> = {
    recent: (r) => r.lastInteractionAt ?? 0,
    time: (r) => r.totalMinutes,
    deepest: (r) => r.depthScore,
    encounters: (r) => r.encounterCount,
    fun: (r) => r.funScore,
    compatible: (r) => r.compatibilityScore,
    deepTalk: (r) => r.deepTalkScore,
  };
  return rows.sort((a, b) => key[sort](b) - key[sort](a));
}

export function fixtureOverview(now: number): ContactsOverview {
  const focus = [
    [2, '3 talks this week'],
    [0, 'You owe her the Kyoto list'],
    [4, 'Birthday in 4 days'],
    [1, 'Pitching Thursday'],
    [6, 'Hasn’t heard from you in 12 days'],
  ] as const;
  return {
    total: 248,
    source: 'apple',
    lastSyncedAt: now - 2 * 60_000,
    focus: focus.map(([i, reason]) => ({
      _id: `fixture${i}` as Id<'people'>,
      name: RAW[i][0],
      photoUrl: null,
      reason,
    })),
  };
}
