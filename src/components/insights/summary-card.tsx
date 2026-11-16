import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useInsightActions } from '@/components/insights/data';
import type { Day } from '@/components/insights/types';
import { Button, Card, JesseNoteTag } from '@/components/ui';
import { C, F, T } from '@/theme/tokens';

const RING = 88;

function Ring({ score }: { score: number }) {
  const r = RING / 2 - 7;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={C.neutralChip} strokeWidth={7} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={C.accent}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <Text style={styles.ringValue}>{Math.round(score)}</Text>
    </View>
  );
}

function Thumb({ down, color }: { down?: boolean; color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path
        d={
          down
            ? 'M5 8.5V3H3v5.5zM5 8.5 8 13.5c1 0 1.8-.8 1.6-1.8L9.2 9.5H13a1 1 0 0 0 1-1.1l-.7-4.6A1 1 0 0 0 12.3 3H5'
            : 'M5 7.5V13H3V7.5zM5 7.5 8 2.5c1 0 1.8.8 1.6 1.8L9.2 6.5H13a1 1 0 0 1 1 1.1l-.7 4.6A1 1 0 0 1 12.3 13H5'
        }
      />
    </Svg>
  );
}

export function SummaryCard({ day, title }: { day: Day; title: string }) {
  const { rateDay } = useInsightActions();
  const [local, setLocal] = useState<{ verdict: 'up' | 'down'; direction?: 'better' | 'worse' }>();
  const rating = local ?? day.userRating;
  const rate = (verdict: 'up' | 'down', direction?: 'better' | 'worse') => {
    setLocal({ verdict, direction });
    rateDay({ date: day.date, verdict, direction }).catch(() => setLocal(undefined));
  };
  const usual = day.baselineReady && day.usual != null ? `your usual is ${Math.round(day.usual)}` : 'no baseline yet';

  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.top}>
        <Ring score={day.score} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.label}>
            {title} · {usual}
          </Text>
          {day.headline ? <Text style={styles.headline}>{day.headline}</Text> : null}
        </View>
      </View>
      {day.take ? (
        <View style={styles.take}>
          <JesseNoteTag />
          <Text style={T.body}>{day.take}</Text>
        </View>
      ) : null}
      <View style={styles.feel}>
        <Text style={[T.meta, { flex: 1 }]}>Does this feel right?</Text>
        {(['up', 'down'] as const).map((v) => {
          const on = rating?.verdict === v;
          return (
            <Pressable
              key={v}
              accessibilityRole="button"
              accessibilityLabel={v === 'up' ? 'Yes, feels right' : 'No, feels off'}
              accessibilityState={{ selected: on }}
              onPress={() => rate(v)}
              style={[styles.thumb, on && { backgroundColor: C.accentTint, borderColor: C.accent }]}>
              <Thumb down={v === 'down'} color={on ? C.accent : C.mutedIcon} />
            </Pressable>
          );
        })}
      </View>
      {rating?.verdict === 'down' ? (
        <View style={{ gap: 8 }}>
          <Text style={T.meta}>
            {rating.direction ? 'Thanks. Jesse will use this for tomorrow’s read.' : 'Was your day better or worse than this?'}
          </Text>
          <View style={styles.feel}>
            {(['better', 'worse'] as const).map((d) => (
              <Button
                key={d}
                compact
                variant={rating.direction === d ? 'primary' : 'outline'}
                label={d === 'better' ? 'It was better' : 'It was worse'}
                onPress={() => rate('down', d)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringValue: { fontFamily: F.display, fontSize: 28, lineHeight: 34, color: C.ink },
  headline: { fontFamily: F.display, fontSize: 20, lineHeight: 25, color: C.ink },
  take: { gap: 6, backgroundColor: C.accentWash, borderRadius: 16, padding: 12 },
  feel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: C.chipBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
