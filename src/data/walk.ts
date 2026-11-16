import { useQuery } from 'convex/react';
import { router } from 'expo-router';

import { api } from '../../convex/_generated/api';
import { firstName, relativeDay } from '@/components/format';
import { useFollowupsByItem } from '@/components/takeaway';
import { useItemActions, useTonightReflection, type ItemWithPerson } from '@/data/hooks';
import { useFollowupActions } from '@/data/people';
import { addToCalendar, openComposer } from '@/lib/actions';

type Followup = ReturnType<typeof useFollowupsByItem> extends Map<unknown, infer F> ? F : never;

export type Stop = {
  key: string;
  label: string;
  line: string;
  yes: string;
  act: () => Promise<void>;
};

const MAX_PEOPLE = 3;

function sentence(text: string) {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

export function useWalkRoute(now: number): Stop[] | undefined {
  const items = useQuery(api.items.open, { kinds: ['you_owe', 'they_owe', 'urgent', 'plan', 'question'], limit: 60 });
  const followups = useFollowupsByItem(now);
  const tonight = useTonightReflection();
  const { done, linkCalendar } = useItemActions();
  const { markSent } = useFollowupActions();
  if (items === undefined || tonight === undefined) return undefined;

  const send = async (followup: Followup) => {
    const body = followup.drafts[0] ?? '';
    const result = await openComposer({ phone: followup.phone, body });
    if (result === 'sent') await markSent(followup._id, body);
  };

  const byPerson = new Map<string, ItemWithPerson>();
  for (const item of items) {
    if (!item.person || byPerson.has(item.person._id)) continue;
    byPerson.set(item.person._id, item);
    if (byPerson.size === MAX_PEOPLE) break;
  }

  const stops: Stop[] = [...byPerson.values()].map((item) => {
    const who = firstName(item.person!.name);
    const followup = followups.get(item._id);
    const said = sentence(item.text);
    if (followup) {
      return {
        key: item._id,
        label: who,
        line: `${said} Want me to send ${who} a text?`,
        yes: 'Yes, text',
        act: () => send(followup),
      };
    }
    if (item.kind === 'plan' && !item.calendarEventId) {
      const when = item.dueAt ? ` ${relativeDay(item.dueAt)}` : '';
      return {
        key: item._id,
        label: who,
        line: `${said} Want it in your calendar${when ? ` for${when}` : ''}?`,
        yes: 'Yes, add it',
        act: async () => {
          const id = await addToCalendar({ title: item.text, startAt: item.dueAt ?? Date.now() + 86_400_000 });
          if (id) await linkCalendar(item._id, id);
        },
      };
    }
    return {
      key: item._id,
      label: who,
      line: `${said} ${item.kind === 'they_owe' ? `Shall I let it go, or is ${who} still on it?` : 'Is that handled now?'}`,
      yes: item.kind === 'they_owe' ? 'Let it go' : 'Yes, done',
      act: async () => {
        await done(item._id);
      },
    };
  });

  if (tonight?.question) {
    stops.push({
      key: 'thought',
      label: 'One thought',
      line: tonight.question,
      yes: 'Talk it through',
      act: async () => {
        router.push('/reflect');
      },
    });
  }
  return stops;
}

function command(text: string) {
  const t = text.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.split(' ').length <= 4 ? t : null;
}

export function heardYes(text: string) {
  const t = command(text);
  return t !== null && /^(?:yes|yeah|yep|yup|sure|ok|okay|do it|send it|go ahead)(?: please| jesse| do it| send it)?$/.test(t);
}

export function heardSkip(text: string) {
  const t = command(text);
  return t !== null && /^(?:skip|skip it|next|no|nope|not now|maybe later|later|pass)(?: please| jesse| thanks)?$/.test(t);
}
