import { useMutation, useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fixtureDay, fixtureEvidence, fixtureProfile, fixtureWeek } from '@/components/insights/fixture';
import { localDateKey } from '@/components/format';

const MODE = __DEV__ ? process.env.EXPO_PUBLIC_INSIGHTS_FIXTURE : undefined;
const FIXTURE = MODE === 'full' || MODE === 'new';
const NEW_USER = MODE === 'new';

export function useToday() {
  return localDateKey();
}

export function useWeek(endDate: string) {
  const live = useQuery(api.insights.week, FIXTURE ? 'skip' : { endDate });
  return FIXTURE ? fixtureWeek(endDate, NEW_USER) : live;
}

export function useDay(date: string) {
  const today = useToday();
  const live = useQuery(api.insights.day, FIXTURE ? 'skip' : { date });
  return FIXTURE ? fixtureDay(date, today, NEW_USER) : live;
}

export function useProfile(today: string) {
  const live = useQuery(api.insights.profile, FIXTURE ? 'skip' : { today });
  return FIXTURE ? fixtureProfile(today, NEW_USER) : live;
}

export function useEvidence(conversationIds: Id<'conversations'>[] | null) {
  const today = useToday();
  const live = useQuery(api.insights.evidence, FIXTURE || !conversationIds?.length ? 'skip' : { conversationIds });
  if (!conversationIds?.length) return [];
  return FIXTURE ? fixtureEvidence(conversationIds, today) : live;
}

export function useInsightActions() {
  const rateDay = useMutation(api.insights.rateDay);
  const removeTrait = useMutation(api.insights.removeTrait);
  const refresh = useMutation(api.insights.refresh);
  return {
    rateDay: FIXTURE ? async () => null : rateDay,
    removeTrait: FIXTURE ? async () => null : removeTrait,
    refresh: FIXTURE ? async () => null : refresh,
  };
}
