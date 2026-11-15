import { useMutation, useQuery } from 'convex/react';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { startOfDay } from '@/components/format';
import { useNow } from './hooks';

export function useIdeaTopics() {
  return useQuery(api.topics.list, {});
}

export function useUrgentItems() {
  return useQuery(api.items.open, { kinds: ['urgent'] });
}

export function useLeftOutToday() {
  const now = useNow();
  const today = useQuery(api.conversations.today, { since: startOfDay(now) });
  return today?.reduce((sum, c) => sum + c.leftOutCount, 0);
}

export function useMarkDone() {
  const update = useMutation(api.items.update);
  return (itemId: Id<'items'>) => update({ itemId, status: 'done' });
}
