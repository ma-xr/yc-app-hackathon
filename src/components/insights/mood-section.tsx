import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { time } from '@/components/format';
import { Desc, FactRow, MoodDot, SectionHead, moodColor } from '@/components/insights/parts';
import { useEvidenceSheet } from '@/components/insights/sheet-context';
import type { Day } from '@/components/insights/types';
import { Card, Divider } from '@/components/ui';
import { C, T } from '@/theme/tokens';

const H = 120;
const PAD = 10;
const HOUR = 3_600_000;

function MoodCurve({ curve }: { curve: Day['mood']['curve'] }) {
  const [w, setW] = useState(0);
  if (!curve.length) return null;
  const pts = [...curve].sort((a, b) => a.at - b.at);
  const first = new Date(pts[0].at);
  first.setMinutes(0, 0, 0);
  const lo = Math.min(first.getTime(), pts[0].at);
  const hi = Math.max(lo + 2 * HOUR, Math.ceil(pts[pts.length - 1].at / HOUR) * HOUR);
  const x = (at: number) => PAD + ((at - lo) / (hi - lo)) * (w - 2 * PAD);
  const y = (v: number) => H / 2 - (Math.max(-2, Math.min(2, v)) / 2) * (H / 2 - PAD);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.at)},${y(p.value)}`).join(' ');
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  return (
    <View
      style={{ gap: 6 }}
      accessibilityLabel={`Mood across the day, ${pts.length} moments`}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          <Line x1={PAD} x2={w - PAD} y1={H / 2} y2={H / 2} stroke={C.line} strokeWidth={1} strokeDasharray="4 4" />
          {pts.length > 1 ? <Path d={d} stroke={C.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {pts.map((p) => (
            <Circle key={`${p.conversationId}-${p.at}`} cx={x(p.at)} cy={y(p.value)} r={5} fill={moodColor(p.value)} stroke={C.surface} strokeWidth={2} />
          ))}
        </Svg>
      ) : (
        <View style={{ height: H }} />
      )}
      <View style={styles.axis}>
        {ticks.map((t) => (
          <Text key={t} style={T.meta}>
            {time(t)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function MoodSection({ day }: { day: Day }) {
  const open = useEvidenceSheet();
  const { mood } = day;
  return (
    <Card style={styles.card}>
      <SectionHead title="Mood" score={mood.score} usual={mood.usual} baselineReady={day.baselineReady} />
      <Desc>{mood.desc}</Desc>
      <MoodCurve curve={mood.curve} />
      {mood.facts.map((f, i) => (
        <View key={`${f.conversationId}-${f.kind}`}>
          {i ? <Divider /> : null}
          <FactRow
            lead={<MoodDot mood={f.mood} />}
            title={f.title}
            value={time(f.at)}
            reason={f.reason}
            onPress={() => open({ title: f.title, sub: f.reason, conversationIds: [f.conversationId] })}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
