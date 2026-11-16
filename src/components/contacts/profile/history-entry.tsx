import { StyleSheet, Text, View } from 'react-native';

import type { ConversationRecord } from '@/components/contacts/data';
import { clockTime, duration, weekdayDate } from '@/components/contacts/profile/format';
import { C, F, S, T } from '@/theme/tokens';

const CHANNEL_LABEL = { in_person: null, call: 'Call', text: 'Texts' } as const;

function moodOf(mood: number) {
  if (mood <= -2) return { label: 'rough', color: C.amberDot };
  if (mood < 0) return { label: 'tense', color: C.amberDot };
  if (mood === 0) return { label: 'neutral', color: C.muted };
  if (mood < 2) return { label: 'good', color: C.accent };
  return { label: 'great', color: C.greenText };
}

export function HistoryEntry({ item, last }: { item: ConversationRecord; last: boolean }) {
  const mood = moodOf(item.mood);
  const meta = [
    weekdayDate(item.startedAt),
    clockTime(item.startedAt),
    item.placeName,
    CHANNEL_LABEL[item.channel],
    item.channel !== 'text' && item.minutes > 0 ? duration(item.minutes) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const points = item.points.slice(0, 4);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${item.title}. ${meta}. Mood: ${mood.label}. ${item.topics.join(', ')}. ${points.join('. ')}`}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: mood.color }]} accessibilityLabel={`Mood: ${mood.label}`} />
        {last ? null : <View style={styles.line} />}
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.meta}>{meta}</Text>
        {item.topics.length ? (
          <View style={styles.topics}>
            {item.topics.map((t) => (
              <View key={t} style={styles.topic}>
                <Text style={styles.topicText}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.points}>
          {points.map((p) => (
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
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  topic: { backgroundColor: C.neutralChip, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  topicText: { fontFamily: F.medium, fontSize: 11, lineHeight: 15, color: C.muted },
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
