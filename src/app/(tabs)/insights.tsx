import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActivitySection } from '@/components/insights/activity-section';
import { useDay, useInsightActions, useProfile, useToday, useWeek } from '@/components/insights/data';
import { EvidenceProvider } from '@/components/insights/evidence-sheet';
import { MoodSection } from '@/components/insights/mood-section';
import { PeopleSection } from '@/components/insights/people-section';
import { SummaryCard } from '@/components/insights/summary-card';
import { Timeline } from '@/components/insights/timeline';
import { WeekStrip } from '@/components/insights/week-strip';
import { YouView } from '@/components/insights/you-view';
import { EmptyCard, H1, Screen } from '@/components/ui';
import { C, F } from '@/theme/tokens';

type View_ = 'day' | 'you';

export default function Insights() {
  const [view, setView] = useState<View_>('day');
  const today = useToday();
  const { refresh } = useInsightActions();

  useFocusEffect(
    useCallback(() => {
      refresh({ date: today, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => {});
    }, [refresh, today]),
  );

  return (
    <EvidenceProvider>
      <Screen>
        <H1>Insights</H1>
        <View style={styles.seg} accessibilityRole="tablist">
          {(
            [
              ['day', 'How was your day?'],
              ['you', 'Who are you?'],
            ] as const
          ).map(([key, label]) => {
            const on = view === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setView(key)}
                style={[styles.segItem, on && styles.segOn]}>
                <Text style={[styles.segText, on && { color: C.onAccent }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {view === 'day' ? <DayView today={today} /> : <YouTab today={today} />}
      </Screen>
    </EvidenceProvider>
  );
}

function dayTitle(date: string, today: string) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const md = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return date === today ? `Today, ${md}` : `${dt.toLocaleDateString('en-US', { weekday: 'short' })}, ${md}`;
}

function DayView({ today }: { today: string }) {
  const [selected, setSelected] = useState(today);
  const week = useWeek(today);
  const day = useDay(selected);

  return (
    <>
      {week ? <WeekStrip days={week} selected={selected} today={today} onSelect={setSelected} /> : null}
      {day === undefined ? (
        <ActivityIndicator color={C.accent} />
      ) : day === null ? (
        <EmptyCard>
          {selected === today
            ? 'Jesse hasn’t read your day yet. Once you’ve had a conversation or two, your score, mood, people and places show up here.'
            : 'No conversations that day.'}
        </EmptyCard>
      ) : (
        <>
          <SummaryCard day={day} title={dayTitle(day.date, today)} />
          <MoodSection day={day} />
          <PeopleSection day={day} />
          <ActivitySection day={day} />
          <Timeline day={day} />
        </>
      )}
    </>
  );
}

function YouTab({ today }: { today: string }) {
  const profile = useProfile(today);
  if (profile === undefined) return <ActivityIndicator color={C.accent} />;
  return <YouView profile={profile} />;
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 999, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.accent },
  segText: { fontFamily: F.semibold, fontSize: 14, color: C.muted },
});
