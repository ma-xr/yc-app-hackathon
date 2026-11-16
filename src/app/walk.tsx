import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Enter, Skeleton } from '@/components/motion';
import { Orb } from '@/components/orb';
import { PressableScale } from '@/components/pressable-scale';
import { RouteCard } from '@/components/route-card';
import { Button, Chip, Screen } from '@/components/ui';
import { useNow } from '@/data/hooks';
import { useWalkRoute, type Stop } from '@/data/walk';
import { getPref, PREF } from '@/lib/prefs';
import { speak, stopSpeaking } from '@/lib/voice';
import { enter, fadeIn, fadeOut, layout } from '@/theme/motion';
import { C, F, S, shadow } from '@/theme/tokens';

const MIN_PER_STOP = 3;
const DONE = 'That’s the walk. Sleep well.';

export default function Walk() {
  const now = useNow();
  const route = useWalkRoute(now);
  const [walk, setWalk] = useState<Stop[]>([]);
  const [stop, setStop] = useState<number | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cheer, setCheer] = useState(0);
  const muted = useRef(false);

  useEffect(() => {
    void getPref(PREF.voiceMuted).then((m) => {
      muted.current = m === '1';
    });
    return () => void stopSpeaking().catch(() => {});
  }, []);

  const say = (line: string) => {
    if (!muted.current) void speak(line).catch(() => {});
  };

  const goTo = (index: number) => {
    const next = walk[index];
    if (!next) {
      setStop(null);
      setSaid(DONE);
      setCheer((n) => n + 1);
      say(DONE);
      return;
    }
    setStop(index);
    say(next.line);
  };

  const current = stop === null ? null : walk[stop];

  const answer = async (yes: boolean) => {
    if (stop === null || !current || busy) return;
    setBusy(true);
    try {
      if (yes) {
        await current.act();
        setCheer((n) => n + 1);
      }
    } catch {
      setSaid('That didn’t save. Try again, or skip.');
      return;
    } finally {
      setBusy(false);
    }
    setSaid(null);
    if (yes && current.key === 'thought') {
      setStop(null);
      return;
    }
    goTo(stop + 1);
  };

  if (current && stop !== null) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Animated.View key={`meta${stop}`} entering={enter(0)} style={styles.top}>
          <Text style={[styles.meta, styles.shrink]} numberOfLines={1}>
            Stop {stop + 1} of {walk.length} · {current.label}
          </Text>
          <Text style={styles.meta}>{(walk.length - stop) * MIN_PER_STOP} min left</Text>
        </Animated.View>
        <View style={styles.track}>
          <Animated.View layout={layout} style={[styles.fill, { width: `${((stop + 1) / walk.length) * 100}%` }]} />
        </View>
        <View style={styles.center}>
          <Orb listening={false} onPress={() => say(current.line)} cheer={cheer} size={170} />
        </View>
        <Animated.Text key={current.key} entering={enter(0)} exiting={fadeOut} layout={layout} style={styles.quote}>
          “{current.line}”
        </Animated.Text>
        {said ? (
          <Animated.Text entering={fadeIn} exiting={fadeOut} layout={layout} style={styles.said}>
            {said}
          </Animated.Text>
        ) : null}
        <Animated.View layout={layout} style={styles.answerRow}>
          <Button
            label={busy ? 'One sec…' : current.yes}
            onPress={() => void answer(true)}
            style={styles.answer}
            accessibilityLabel={`${current.yes} for ${current.label}`}
          />
          <Button
            label="Skip"
            variant="dark"
            haptic={false}
            onPress={() => void answer(false)}
            style={[styles.answer, styles.skip]}
          />
        </Animated.View>
        <Animated.View layout={layout}>
          <Button label="End the walk" variant="ghost" onPress={() => setStop(null)} />
        </Animated.View>
      </Screen>
    );
  }

  const stops = route ?? [];
  const people = stops.filter((s) => s.key !== 'thought').length;
  const hasThought = stops.some((s) => s.key === 'thought');

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Text style={styles.meta}>Tonight</Text>
        <PressableScale
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close the walk"
          style={styles.closeHit}>
          <Text style={styles.close}>Close</Text>
        </PressableScale>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        Walk home with Jesse
      </Text>
      {said ? (
        <Animated.Text entering={fadeIn} exiting={fadeOut} layout={layout} style={styles.said}>
          {said}
        </Animated.Text>
      ) : null}
      {route === undefined ? (
        <View style={styles.loading} accessibilityLabel="Planning tonight’s route">
          <View style={styles.skeletonCard}>
            <Skeleton width="60%" height={14} />
            <Skeleton height={ROUTE_H} radius={S.cardRadius - 10} />
          </View>
          <Skeleton width={180} height={24} radius={999} />
          <Skeleton height={56} radius={S.buttonRadius} />
        </View>
      ) : stops.length > 0 ? (
        <>
          <Enter index={0}>
            <RouteCard
              labels={['Your day', ...stops.map((s) => s.label)]}
              reached={0}
              title={`Tonight’s route · about ${stops.length * MIN_PER_STOP} minutes`}
            />
          </Enter>
          <Enter index={1} style={styles.chips}>
            {people ? (
              <Chip tone="amber">{`${people} ${people === 1 ? 'person' : 'people'} to think about`}</Chip>
            ) : null}
            {hasThought ? <Chip tone="green">1 open question</Chip> : null}
          </Enter>
          <Enter index={2}>
            <Button
              label="Start the walk"
              onPress={() => {
                setWalk(stops);
                setSaid(null);
                setStop(0);
                say(stops[0].line);
              }}
              style={styles.start}
            />
          </Enter>
        </>
      ) : (
        <Enter>
          <Text style={styles.empty}>No stops tonight. Talk with people and Jesse will plan tomorrow’s walk.</Text>
        </Enter>
      )}
    </Screen>
  );
}

const ROUTE_H = 170;

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  meta: { fontFamily: F.medium, fontSize: 14, color: C.muted },
  shrink: { flexShrink: 1 },
  closeHit: {
    minHeight: S.touch,
    minWidth: S.touch,
    paddingHorizontal: 8,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { fontFamily: F.semibold, fontSize: 14, color: C.accent },
  title: { fontFamily: F.display, fontSize: 32, lineHeight: 38, color: C.ink },
  center: { alignItems: 'center', marginVertical: -24 },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: C.surface,
    overflow: 'hidden',
    marginTop: -6,
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: C.accent },
  quote: { fontFamily: F.display, fontSize: 26, lineHeight: 35, color: C.ink },
  said: {
    fontFamily: F.medium,
    fontSize: 15,
    lineHeight: 21,
    color: C.accentDeep,
  },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  start: { minHeight: 56, borderRadius: S.buttonRadius },
  empty: {
    fontFamily: F.regular,
    fontSize: 15,
    lineHeight: 21,
    color: C.muted,
  },
  loading: { gap: S.gap },
  skeletonCard: {
    backgroundColor: C.surface,
    borderRadius: S.cardRadius,
    padding: 16,
    gap: 8,
    ...shadow,
  },
  answerRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  answer: { flex: 1, minHeight: 58, borderRadius: S.buttonRadius },
  skip: { backgroundColor: C.surface, borderColor: C.surface },
});
