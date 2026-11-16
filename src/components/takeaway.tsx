import { useQuery } from 'convex/react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { firstName, relativeDay, time } from '@/components/format';
import { Enter } from '@/components/motion';
import { Button, Card, Chip, type Tone } from '@/components/ui';
import { useItemActions, type ItemWithPerson } from '@/data/hooks';
import { useFollowupActions } from '@/data/people';
import { addToCalendar, openComposer } from '@/lib/actions';
import { fadeIn, layout } from '@/theme/motion';
import { C, T } from '@/theme/tokens';

const DAY = 86_400_000;

const KIND_CHIP: Partial<Record<ItemWithPerson['kind'], { label: string; tone: Tone }>> = {
  you_owe: { label: 'You promised', tone: 'accent' },
  they_owe: { label: 'Owes you', tone: 'amber' },
  urgent: { label: 'Small but urgent', tone: 'amber' },
  plan: { label: 'Plan', tone: 'accent' },
};

export function useFollowupsByItem(now: number) {
  const soon = useQuery(api.followups.forToday, { dayEnd: now + DAY });
  const later = useQuery(api.followups.forToday, { dayEnd: now + 4 * DAY });
  const latest = useQuery(api.followups.forToday, { dayEnd: now + 7 * DAY });
  const byItem = new Map<Id<'items'>, NonNullable<typeof soon>[number]>();
  for (const f of [...(soon ?? []), ...(later ?? []), ...(latest ?? [])]) {
    if (f.itemId && !byItem.has(f.itemId)) byItem.set(f.itemId, f);
  }
  return byItem;
}

type Followup = ReturnType<typeof useFollowupsByItem> extends Map<unknown, infer F> ? F : never;

export function Takeaways({ items, followups }: { items: ItemWithPerson[]; followups: Map<Id<'items'>, Followup> }) {
  if (!items.length) return null;
  return (
    <Animated.View layout={layout} style={styles.list}>
      <Text style={[T.label, styles.label]}>Takeaways from this conversation</Text>
      {items.map((item, i) => (
        <Enter key={item._id} index={i}>
          <Takeaway item={item} followup={followups.get(item._id)} />
        </Enter>
      ))}
    </Animated.View>
  );
}

export function Takeaway({ item, followup }: { item: ItemWithPerson; followup?: Followup }) {
  const { done, dismiss, linkCalendar } = useItemActions();
  const { markSent } = useFollowupActions();
  const chip = KIND_CHIP[item.kind];
  const when = item.dueAt ? `${relativeDay(item.dueAt)} · ${time(item.dueAt)}` : null;

  const addCalendar = async () => {
    const id = await addToCalendar({ title: item.text, startAt: item.dueAt ?? Date.now() + 86_400_000 });
    if (id) await linkCalendar(item._id, id);
  };

  const sendFollowup = async () => {
    if (!followup) return;
    const body = followup.drafts[0] ?? '';
    const result = await openComposer({ phone: followup.phone, body });
    if (result === 'sent') await markSent(followup._id, body);
  };

  const who = item.person ? firstName(item.person.name) : null;

  return (
    <Card style={styles.card}>
      <View style={{ gap: 6 }}>
        <View style={styles.meta}>
          {chip ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}
          {when ? <Text style={T.meta}>{when}</Text> : null}
        </View>
        <Text style={T.cardTitle}>{item.text}</Text>
      </View>
      <Animated.View layout={layout} style={styles.actions}>
        {item.kind === 'plan' ? (
          item.calendarEventId ? (
            <Animated.View entering={fadeIn}>
              <Chip tone="green">Going · in your calendar</Chip>
            </Animated.View>
          ) : (
            <>
              <Button label="Going" icon="calendarPlus" compact accessibilityLabel={`Going: ${item.text}`} onPress={() => void addCalendar()} />
              <Button label="Not now" variant="outline" compact accessibilityLabel={`Not now: ${item.text}`} onPress={() => void dismiss(item._id)} />
            </>
          )
        ) : null}
        {item.kind === 'urgent' && !item.calendarEventId ? (
          <Button label="Add to calendar" icon="calendarPlus" compact haptic={false} onPress={() => void addCalendar()} />
        ) : null}
        {followup ? (
          <Button
            label="Send follow-up"
            icon="message"
            compact
            variant={item.kind === 'plan' ? 'outline' : 'primary'}
            haptic="light"
            accessibilityLabel={`Send follow-up${who ? ` to ${who}` : ''}: ${item.text}`}
            onPress={() => void sendFollowup()}
          />
        ) : null}
        {item.kind !== 'plan' ? (
          <Button
            label="Done"
            icon="check"
            variant="outline"
            compact
            haptic="light"
            accessibilityLabel={`Mark done: ${item.text}`}
            onPress={() => void done(item._id)}
          />
        ) : null}
      </Animated.View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: C.line, marginLeft: 8 },
  label: { marginTop: 2 },
  card: { gap: 10, paddingVertical: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
