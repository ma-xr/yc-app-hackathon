import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { time } from '@/components/format';
import { Icon } from '@/components/icon';
import { MoodDot } from '@/components/insights/parts';
import { useEvidenceSheet } from '@/components/insights/sheet-context';
import type { Day } from '@/components/insights/types';
import { Enter } from '@/components/motion';
import { PressableScale } from '@/components/pressable-scale';
import { Card, Chip, Divider } from '@/components/ui';
import { C, F, T } from '@/theme/tokens';

export function Timeline({ day }: { day: Day }) {
  const open = useEvidenceSheet();
  const [expanded, setExpanded] = useState(false);
  if (!day.timeline.length) return null;
  return (
    <Card style={styles.card}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((e) => !e)}
        style={styles.toggle}>
        <Text style={styles.toggleText}>{expanded ? 'Hide hour by hour' : 'Your day, hour by hour'}</Text>
        <View style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }}>
          <Icon name="chevronRight" size={16} color={C.accent} />
        </View>
      </PressableScale>
      {expanded
        ? day.timeline.map((m, i) => {
            const place = m.place ?? 'Somewhere';
            const at = time(m.startedAt);
            const who = m.people.map((p) => p.name).join(', ');
            return (
              <Enter key={m._id} index={i}>
                {i ? <Divider /> : null}
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`${at}, ${place}${who ? `, with ${who}` : ''}, ${m.minutes} minutes`}
                  onPress={() =>
                    open({
                      title: `${place} · ${at}`,
                      sub: m.summaryLine,
                      conversationIds: [m._id],
                      personId: m.people[0]?._id,
                    })
                  }
                  style={styles.row}>
                  <Text style={[T.meta, styles.time]}>{at}</Text>
                  <View style={styles.dot}>
                    <MoodDot mood={m.mood} />
                  </View>
                  <View style={styles.body}>
                    <Text style={T.cardTitle} numberOfLines={1}>
                      {place}
                    </Text>
                    <Text style={[T.bodySmall, { color: C.muted }]} numberOfLines={2}>
                      {[who, `${m.minutes} min`].filter(Boolean).join(' · ')}
                    </Text>
                    {m.topics.length ? (
                      <View style={styles.chips}>
                        {m.topics.map((t) => (
                          <Chip key={t} tone="neutral">
                            {t}
                          </Chip>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </PressableScale>
              </Enter>
            );
          })
        : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  toggleText: { fontFamily: F.semibold, fontSize: 15, color: C.accent },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, minHeight: 44 },
  time: { width: 64, paddingTop: 2 },
  dot: { paddingTop: 6 },
  body: { flex: 1, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 2 },
});
