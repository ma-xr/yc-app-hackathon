import { useQuery } from 'convex/react';

import { api } from '../../convex/_generated/api';
import { startOfDay } from '@/components/format';

export function addDays(ms: number, n: number) {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return startOfDay(d.getTime());
}

export function weekStartOf(ms: number) {
  return addDays(ms, -((new Date(ms).getDay() + 6) % 7));
}

export function usePlansWeek(weekStart: number) {
  const weekEnd = addDays(weekStart, 7);
  const conversations = useQuery(api.conversations.range, { from: weekStart, to: weekEnd });
  const open = useQuery(api.items.open, { kinds: ['plan', 'you_owe', 'they_owe', 'urgent'], limit: 100 });
  if (conversations === undefined || open === undefined) return undefined;
  const items = open.filter((i) => i.dueAt !== undefined && i.dueAt >= weekStart && i.dueAt < weekEnd);
  return { conversations, items };
}

export type PlansWeek = NonNullable<ReturnType<typeof usePlansWeek>>;
