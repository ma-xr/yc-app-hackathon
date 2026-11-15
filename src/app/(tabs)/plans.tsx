import { useMutation } from 'convex/react';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../convex/_generated/api';
import { dayDiff, firstName, fullDate, startOfDay, weekday } from '@/components/format';
import { ConversationCard, EntryCard } from '@/components/conversation-card';
import { Icon } from '@/components/icon';
import { Takeaways, useFollowupsByItem } from '@/components/takeaway';
import { Button, EmptyCard, H1, Screen, type Tone } from '@/components/ui';
import { useNow } from '@/data/hooks';
import { addDays, usePlansWeek, weekStartOf, type PlansWeek } from '@/data/plans';
import { addToCalendar, openComposer } from '@/lib/actions';
import { C, F, S, shadow, T } from '@/theme/tokens';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type PlanItem = PlansWeek['items'][number];

function weekLabel(start: number) {
  const a = new Date(start);
  const b = new Date(addDays(start, 6));
  const right = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${MONTH[b.getMonth()]} ${b.getDate()}`;
  return `${MONTH[a.getMonth()]} ${a.getDate()} – ${right}`;
}

function sameDay(ms: number, day: number) {
  return startOfDay(ms) === day;
}

export default function Plans() {
  const now = useNow();
  const today = startOfDay(now);
  const [offset, setOffset] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const weekStart = addDays(weekStartOf(now), offset * 7);
  const data = usePlansWeek(weekStart);
  const followups = useFollowupsByItem(now);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const hasConversations = (d: number) => !!data?.conversations.some((c) => sameDay(c.startedAt, d));
  const hasPlans = (d: number) => !!data?.items.some((i) => sameDay(i.dueAt!, d));

  const defaultDay = (() => {
    if (offset > 0) return days.find(hasPlans) ?? days[0];
    const past = days.filter((d) => d <= today && hasConversations(d));
    if (offset === 0) return hasConversations(today) || hasPlans(today) ? today : (past.at(-1) ?? today);
    return past.at(-1) ?? days[6];
  })();
  const selected = picked !== null && days.includes(picked) ? picked : defaultDay;
  const diff = dayDiff(selected, now);

  const move = (next: number) => {
    setOffset(next);
    setPicked(null);
  };

  const dayConversations = diff <= 0 ? (data?.conversations.filter((c) => sameDay(c.startedAt, selected)) ?? []) : [];
  const dayItems = diff >= 0 ? (data?.items.filter((i) => sameDay(i.dueAt!, selected)) ?? []) : [];
  const meta =
    diff < 0
      ? `${dayConversations.length} ${dayConversations.length === 1 ? 'conversation' : 'conversations'}`
      : diff === 0
        ? 'So far today'
        : 'Coming up';

  return (
    <Screen>
      <View style={styles.header}>
        <H1>Plans</H1>
        <Button
          label="Today"
          variant="outline"
          accessibilityLabel="Jump to today"
          onPress={() => {
            move(0);
            setPicked(today);
          }}
        />
      </View>

      <View style={styles.weekRow}>
        <ChevronButton label="Previous week" icon="chevronLeft" disabled={offset <= -1} onPress={() => move(offset - 1)} />
        <Text style={styles.weekLabel} accessibilityLiveRegion="polite">
          {weekLabel(weekStart)}
        </Text>
        <ChevronButton label="Next week" icon="chevronRight" disabled={offset >= 1} onPress={() => move(offset + 1)} />
      </View>

      <View style={styles.strip}>
        {days.map((d) => {
          const isSelected = d === selected;
          const isToday = d === today;
          const filled = d <= today && hasConversations(d);
          const hollow = !filled && d >= today && hasPlans(d);
          const status = filled ? 'has conversations' : hollow ? 'has plans' : 'nothing noted';
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityLabel={`${fullDate(d)}, ${status}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setPicked(d)}
              style={[
                styles.day,
                isSelected
                  ? { backgroundColor: C.ink, borderColor: C.ink, borderWidth: 1 }
                  : isToday
                    ? { borderColor: C.accent, borderWidth: 2 }
                    : { borderColor: C.line, borderWidth: 1 },
              ]}>
              <Text style={[styles.dayWeekday, { color: isSelected ? '#D9D5EA' : C.muted }]}>{weekday(d)}</Text>
              <Text style={[styles.dayNumber, { color: isSelected ? '#FFFFFF' : C.ink }]}>{new Date(d).getDate()}</Text>
              <View
                style={[
                  styles.dot,
                  filled && { backgroundColor: isSelected ? '#FFFFFF' : C.ink },
                  hollow && { borderWidth: 2, borderColor: isSelected ? '#FFFFFF' : C.accent },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: C.ink }]} />
          <Text style={T.meta}>Past conversations</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { borderWidth: 2, borderColor: C.accent }]} />
          <Text style={T.meta}>Plans</Text>
        </View>
      </View>

      <View style={styles.dayHeading}>
        <Text accessibilityRole="header" style={styles.dayTitle}>
          {fullDate(selected)}
        </Text>
        <Text style={T.meta}>{meta}</Text>
      </View>

      {data === undefined ? (
        <ActivityIndicator color={C.accent} />
      ) : dayConversations.length + dayItems.length === 0 ? (
        <EmptyCard>
          {diff < 0
            ? 'No conversations noted this day.'
            : diff === 0
              ? 'Nothing yet today. Tap the orb on Home during a conversation.'
              : 'Nothing planned. A free evening to call someone?'}
        </EmptyCard>
      ) : (
        <View style={{ gap: 12 }}>
          {dayConversations.map((c) => (
            <View key={c._id} style={{ gap: 8 }}>
              <ConversationCard conversation={{ ...c, items: [] }} />
              <Takeaways items={data.takeaways.filter((i) => i.conversationId === c._id)} followups={followups} />
            </View>
          ))}
          {dayItems.map((i) => (
            <PlanCard key={i._id} item={i} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function ChevronButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'chevronLeft' | 'chevronRight';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.chevron}>
      <Icon name={icon} size={22} color={disabled ? C.disabled : C.ink} strokeWidth={2} />
    </Pressable>
  );
}

function PlanCard({ item }: { item: PlanItem }) {
  const update = useMutation(api.items.update);
  const person = item.person;
  const chip: { label: string; tone: Tone } =
    item.kind === 'urgent'
      ? { label: 'Reminder', tone: 'green' }
      : item.kind === 'they_owe'
        ? { label: 'Check-in', tone: 'amber' }
        : { label: item.kind === 'you_owe' ? 'Promise' : 'Plan', tone: 'accent' };
  const detail =
    item.kind === 'you_owe' ? 'From your promise' : item.kind === 'they_owe' ? 'Waiting on a follow-up' : undefined;

  const addCalendar = async () => {
    const id = await addToCalendar({ title: item.text, startAt: item.dueAt! });
    if (id) await update({ itemId: item._id, calendarEventId: id });
  };

  return (
    <EntryCard at={item.dueAt!} chip={chip} title={item.text} detail={detail}>
      <View style={styles.actions}>
        {item.calendarEventId ? (
          <View accessibilityLabel="In your calendar" style={styles.inCalendar}>
            <Icon name="check" size={14} color={C.greenText} strokeWidth={2.4} />
            <Text style={[T.chip, { color: C.greenText }]}>In your calendar</Text>
          </View>
        ) : (
          <Button
            label="Add to calendar"
            icon="calendarPlus"
            accessibilityLabel={`Add ${item.text} to calendar`}
            onPress={() => void addCalendar()}
          />
        )}
        {person ? (
          <Button
            label={`Text ${firstName(person.name)}`}
            variant="outline"
            icon="message"
            onPress={() =>
              void openComposer({
                phone: person.phone,
                body: `Hi ${firstName(person.name)}, checking in about: ${item.text}`,
              })
            }
          />
        ) : null}
      </View>
    </EntryCard>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekLabel: { fontFamily: F.semibold, fontSize: 16, color: C.ink },
  chevron: { width: S.touch, height: S.touch, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 72,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    ...shadow,
  },
  dayWeekday: { fontFamily: F.medium, fontSize: 11, lineHeight: 14 },
  dayNumber: { fontFamily: F.bold, fontSize: 18, lineHeight: 22 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  dayTitle: { fontFamily: F.bold, fontSize: 18, color: C.ink },
  entry: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  time: { width: 64, fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted, paddingTop: 4 },
  extra: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  inCalendar: {
    minHeight: S.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: C.greenTint,
  },
});
