import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Orb } from '@/components/orb';
import { RouteCard } from '@/components/route-card';
import { Button, Chip, Screen } from '@/components/ui';
import { useNow } from '@/data/hooks';
import { useWalkRoute, type Stop } from '@/data/walk';
import { getPref, PREF } from '@/lib/prefs';
import { speak, stopSpeaking } from '@/lib/voice';
import { C, F, S } from '@/theme/tokens';

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
      <Screen>
        <View style={styles.top}>
          <Text style={styles.meta}>
            Stop {stop + 1} of {walk.length} · {current.label}
          </Text>
          <Text style={styles.meta}>{(walk.length - stop) * MIN_PER_STOP} min left</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${((stop + 1) / walk.length) * 100}%` }]} />
        </View>
        <View style={styles.center}>
          <Orb listening={false} onPress={() => say(current.line)} cheer={cheer} size={170} />
        </View>
        <Animated.Text key={current.key} entering={FadeInDown.duration(400)} style={styles.quote}>
          “{current.line}”
        </Animated.Text>
        {said ? <Text style={styles.said}>{said}</Text> : null}
        <View style={styles.answerRow}>
          <Button
            label={busy ? 'One sec…' : current.yes}
            onPress={() => void answer(true)}
            style={styles.answer}
            accessibilityLabel={`${current.yes} for ${current.label}`}
          />
          <Button label="Skip" variant="dark" onPress={() => void answer(false)} style={[styles.answer, styles.skip]} />
        </View>
        <Button label="End the walk" variant="ghost" onPress={() => setStop(null)} />
      </Screen>
    );
  }

  const stops = route ?? [];
  const people = stops.filter((s) => s.key !== 'thought').length;
  const hasThought = stops.some((s) => s.key === 'thought');

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.meta}>Tonight</Text>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close the walk">
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        Walk home with Jesse
      </Text>
      {said ? <Text style={styles.said}>{said}</Text> : null}
      {stops.length > 0 ? (
        <>
          <RouteCard
            labels={['Your day', ...stops.map((s) => s.label)]}
            reached={0}
            title={`Tonight’s route · about ${stops.length * MIN_PER_STOP} minutes`}
          />
          <View style={styles.chips}>
            {people ? <Chip tone="amber">{`${people} ${people === 1 ? 'person' : 'people'} to think about`}</Chip> : null}
            {hasThought ? <Chip tone="green">1 open question</Chip> : null}
          </View>
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
        </>
      ) : route !== undefined ? (
        <Text style={styles.empty}>No stops tonight. Talk with people and Jesse will plan tomorrow’s walk.</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { fontFamily: F.medium, fontSize: 14, color: C.muted },
  close: { fontFamily: F.semibold, fontSize: 14, color: C.accent },
  title: { fontFamily: F.display, fontSize: 32, lineHeight: 38, color: C.ink },
  center: { alignItems: 'center', marginVertical: -24 },
  track: { height: 5, borderRadius: 3, backgroundColor: C.surface, overflow: 'hidden', marginTop: -6 },
  fill: { height: 5, borderRadius: 3, backgroundColor: C.accent },
  quote: { fontFamily: F.display, fontSize: 26, lineHeight: 35, color: C.ink },
  said: { fontFamily: F.medium, fontSize: 15, lineHeight: 21, color: C.accentDeep },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  start: { minHeight: 56, borderRadius: S.buttonRadius },
  empty: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: C.muted },
  answerRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  answer: { flex: 1, minHeight: 58, borderRadius: S.buttonRadius },
  skip: { backgroundColor: C.surface, borderColor: C.surface },
});
