import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActivitySection } from '@/components/insights/activity-section';
import { useDay, useInsightActions, useProfile, useToday, useWeek } from '@/components/insights/data';
import { EvidenceProvider } from '@/components/insights/evidence-sheet';
import { MoodSection } from '@/components/insights/mood-section';
import { PeopleSection } from '@/components/insights/people-section';
import { SummaryCard } from '@/components/insights/summary-card';
import { Timeline } from '@/components/insights/timeline';
import { WeekStrip } from '@/components/insights/week-strip';
import { YouView } from '@/components/insights/you-view';
import { Enter, SkeletonCard } from '@/components/motion';
import { PressableScale } from '@/components/pressable-scale';
import { EmptyCard, H1, Screen } from '@/components/ui';
import { C, F, S } from '@/theme/tokens';

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
              <PressableScale
                key={key}
                haptic="selection"
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setView(key)}
                style={[styles.segItem, on && styles.segOn]}>
                <Text style={[styles.segText, on && { color: C.onAccent }]}>{label}</Text>
              </PressableScale>
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
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? today;
  const week = useWeek(today);
  const day = useDay(selected);

  return (
    <>
      {week ? <WeekStrip days={week} selected={selected} today={today} onSelect={(date) => setPicked(date === today ? null : date)} /> : null}
      {day === undefined ? (
        <SkeletonCard lines={3} />
      ) : day === null ? (
        <EmptyCard>
          {selected === today
            ? 'Jesse hasn’t read your day yet. Once you’ve had a conversation or two, your score, mood, people and places show up here.'
            : 'No conversations that day.'}
        </EmptyCard>
      ) : (
        <>
          <Enter index={0}>
            <SummaryCard day={day} title={dayTitle(day.date, today)} />
          </Enter>
          <Enter index={1}>
            <MoodSection day={day} />
          </Enter>
          <Enter index={2}>
            <PeopleSection day={day} />
          </Enter>
          <Enter index={3} style={{ gap: S.gap }}>
            <ActivitySection day={day} />
          </Enter>
          <Enter index={4}>
            <Timeline day={day} />
          </Enter>
        </>
      )}
    </>
  );
}

function YouTab({ today }: { today: string }) {
  const profile = useProfile(today);
  if (profile === undefined) return <SkeletonCard lines={3} />;
  return <YouView profile={profile} />;
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 999, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.accent },
  segText: { fontFamily: F.semibold, fontSize: 14, color: C.muted },
});
