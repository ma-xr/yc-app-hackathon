import { useAction, useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import { localDate } from '@/lib/notifications';

export type Person = Doc<'people'>;
export type Item = Doc<'items'>;
export type Conversation = Doc<'conversations'>;
export type ItemWithPerson = Item & { person: Person | null };

export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', (state) => state === 'active' && tick());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return now;
}

export function useBeforeYouForget() {
  return useQuery(api.items.open, { kinds: ['you_owe', 'they_owe', 'urgent', 'question'], limit: 3 });
}

export function useOpenItems() {
  return useQuery(api.items.open, {});
}

export function useItemActions() {
  const update = useMutation(api.items.update).withOptimisticUpdate((store, { itemId, status }) => {
    if (status === undefined || status === 'open') return;
    for (const { args, value } of store.getAllQueries(api.items.open)) {
      if (value) store.setQuery(api.items.open, args, value.filter((i) => i._id !== itemId));
    }
  });
  return {
    done: (itemId: Id<'items'>) => update({ itemId, status: 'done' }),
    dismiss: (itemId: Id<'items'>) => update({ itemId, status: 'dismissed' }),
    edit: (itemId: Id<'items'>, text: string) => update({ itemId, text }),
    linkCalendar: (itemId: Id<'items'>, calendarEventId: string) => update({ itemId, calendarEventId }),
  };
}

export function useSeedDemo() {
  return useMutation(api.seed.demo);
}

export function usePeople() {
  return useQuery(api.people.list, {});
}

export function usePerson(personId: Id<'people'>) {
  return useQuery(api.people.get, { personId });
}

export function useConversationsRange(from: number, to: number) {
  return useQuery(api.conversations.range, { from, to });
}

export function useTopics() {
  return useQuery(api.topics.list, {});
}

export function useTonightReflection() {
  return useQuery(api.reflections.tonight, { date: localDate() });
}

export function useAskJesse() {
  return useAction(api.jesse.ask);
}
