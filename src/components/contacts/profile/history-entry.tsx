import { StyleSheet, Text, View } from 'react-native';

import { duration, weekdayDate } from '@/components/contacts/profile/format';
import type { Interaction } from '@/components/contacts/profile/types';
import { C, F, S, T } from '@/theme/tokens';

const KIND_LABEL = { in_person: null, call: 'Call', text: 'Texts' } as const;

export function HistoryEntry({ item, last }: { item: Interaction; last: boolean }) {
  const meta = [
    item.placeName,
    KIND_LABEL[item.kind],
    weekdayDate(item.startedAt),
    item.kind !== 'text' && item.minutes > 0 ? duration(item.minutes) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row} accessible accessibilityLabel={`${item.title}. ${meta}. ${item.points.join('. ')}`}>
      <View style={styles.rail}>
        <View style={styles.dot} />
        {last ? null : <View style={styles.line} />}
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>{meta}</Text>
        <View style={styles.points}>
          {item.points.map((p) => (
            <View key={p} style={styles.point}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

export function MonthHeader({ title }: { title: string }) {
  return (
    <Text accessibilityRole="header" style={styles.month}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: S.screenX },
  rail: { width: 20, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent, marginTop: 7 },
  line: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: C.line, marginTop: 6 },
  body: { flex: 1, paddingLeft: 10, paddingBottom: 26 },
  title: { ...T.cardTitle, lineHeight: 21 },
  meta: { ...T.meta, fontSize: 12, marginTop: 2 },
  points: { marginTop: 8, gap: 4 },
  point: { flexDirection: 'row', gap: 8 },
  bullet: { ...T.bodySmall, color: C.muted },
  pointText: { ...T.bodySmall, flex: 1 },
  month: {
    fontFamily: F.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: C.muted,
    paddingHorizontal: S.screenX,
    paddingTop: 18,
    paddingBottom: 12,
  },
});
