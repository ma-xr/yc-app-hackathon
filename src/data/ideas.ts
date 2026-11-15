import { useQuery } from 'convex/react';

import { api } from '../../convex/_generated/api';
import { startOfDay } from '@/components/format';
import { useNow } from './hooks';

export function useIdeaTopics() {
  return useQuery(api.topics.list, {});
}

export function useLeftOutToday() {
  const now = useNow();
  const today = useQuery(api.conversations.today, { since: startOfDay(now) });
  return today?.reduce((sum, c) => sum + c.leftOutCount, 0);
}
