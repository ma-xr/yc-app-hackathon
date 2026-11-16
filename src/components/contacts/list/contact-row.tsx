import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ContactAvatar } from '@/components/contacts/contact-avatar';
import type { Metric } from '@/components/contacts/list/sort';
import { C, F, S, T } from '@/theme/tokens';

export const ROW_HEIGHT = 68;

export const ContactRow = memo(function ContactRow({
  name,
  photoUrl,
  avatarKey,
  subtitle,
  metric,
  onPress,
}: {
  name: string;
  photoUrl: string | null;
  avatarKey?: string;
  subtitle: string | null;
  metric: Metric;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[name, subtitle, metric.label].filter(Boolean).join(', ')}
      accessibilityHint="Opens contact"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.accentWash }]}>
      <ContactAvatar name={name} photoUrl={photoUrl} avatarKey={avatarKey} size={44} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {metric.kind === 'meter' ? <DotMeter value={metric.value} /> : <Text style={styles.metric}>{metric.text}</Text>}
    </Pressable>
  );
});

function DotMeter({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <View style={styles.meter}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={[styles.dot, { backgroundColor: i <= filled ? C.accent : C.line }]} />
      ))}
      <Text style={styles.meterValue}>{value.toFixed(1)}</Text>
    </View>
  );
}

export function RowDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: S.screenX,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: F.display, fontSize: 17, lineHeight: 22, color: C.ink },
  sub: { ...T.meta, fontFamily: F.regular },
  metric: { fontFamily: F.medium, fontSize: 13, color: C.muted, fontVariant: ['tabular-nums'] },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meterValue: { fontFamily: F.medium, fontSize: 12, color: C.muted, marginLeft: 5, fontVariant: ['tabular-nums'] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginLeft: S.screenX + 44 + 14 },
});
