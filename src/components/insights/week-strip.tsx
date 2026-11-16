import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import type { WeekDay } from '@/components/insights/types';
import { C, F, T } from '@/theme/tokens';

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function label(date: string, today: string) {
  if (date === today) return 'Today';
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

export function WeekStrip({
  days,
  selected,
  today,
  onSelect,
}: {
  days: WeekDay[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
}) {
  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel="This week">
      {days.map((d) => {
        const on = d.date === selected;
        const name = label(d.date, today);
        return (
          <PressableScale
            haptic="selection"
            key={d.date}
            accessibilityRole="tab"
            accessibilityLabel={d.score === null ? `${name}, no data` : `${name}, score ${d.score}`}
            accessibilityState={{ selected: on, disabled: d.score === null }}
            disabled={d.score === null}
            onPress={() => onSelect(d.date)}
            style={styles.day}>
            <View style={[styles.col, on && { borderColor: C.accent }]}>
              <View
                style={[
                  styles.bar,
                  { height: `${d.score ?? 0}%`, backgroundColor: on ? C.accent : C.accentTint },
                ]}
              />
            </View>
            <Text style={[styles.label, on && { color: C.ink, fontFamily: F.bold }]}>{name}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 6, minHeight: 44 },
  col: {
    width: '100%',
    height: 64,
    borderRadius: 10,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    padding: 3,
  },
  bar: { width: '100%', borderRadius: 7 },
  label: { ...T.meta, fontSize: 12 },
});
