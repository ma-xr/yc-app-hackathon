import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { C, F, T } from '@/theme/tokens';

export function formatMins(m: number) {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
}

export function moodColor(mood: number | null | undefined) {
  if (mood == null || mood === 0) return C.mutedIcon;
  return mood > 0 ? C.greenText : C.amberDot;
}

export const MOOD_WORD = ['rough', 'a bit low', 'neutral', 'good', 'great'];
export const moodWord = (mood: number | null | undefined) =>
  mood == null ? 'unknown' : MOOD_WORD[Math.max(0, Math.min(4, Math.round(mood) + 2))];

export const SPLIT_COLORS = [C.accent, C.greenText, C.amberDot, C.mutedIcon, C.accentDeep, C.chipBorder];

export function MoodDot({ mood, size = 10 }: { mood: number | null | undefined; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: moodColor(mood) }} />;
}

export function SectionHead({
  title,
  score,
  usual,
  baselineReady,
}: {
  title: string;
  score: number;
  usual?: number | null;
  baselineReady: boolean;
}) {
  const delta = usual == null ? null : Math.round(score - usual);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.headTop}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.score}>{Math.round(score)}</Text>
      </View>
      <View style={styles.headTop}>
        <View style={[styles.track, { flex: 1 }]}>
          <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, score))}%` }]} />
        </View>
        <Text style={T.meta}>
          {!baselineReady || delta === null ? 'no baseline yet' : `${delta >= 0 ? '+' : ''}${delta} vs your usual`}
        </Text>
      </View>
    </View>
  );
}

export function Desc({ children }: { children: ReactNode }) {
  return <Text style={T.body}>{children}</Text>;
}

export function FactRow({
  lead,
  title,
  tag,
  value,
  reason,
  onPress,
  accessibilityLabel,
}: {
  lead?: ReactNode;
  title: string;
  tag?: string | null;
  value?: ReactNode;
  reason?: string | null;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, tag, typeof value === 'string' ? value : null, reason].filter(Boolean).join(', ')}
      onPress={onPress}
      style={styles.fact}>
      <View style={styles.factTop}>
        {lead}
        <Text style={[T.cardTitle, { flexShrink: 1 }]} numberOfLines={2}>
          {title}
        </Text>
        {tag ? (
          <View style={styles.tag}>
            <Text style={[T.chip, { color: C.accentDeep, fontSize: 11 }]} numberOfLines={1}>
              {tag}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexShrink: 0 }}>{typeof value === 'string' ? <Text style={styles.value}>{value}</Text> : value}</View>
      </View>
      {reason ? <Text style={[T.bodySmall, { color: C.muted }]}>{reason}</Text> : null}
    </PressableScale>
  );
}

export function SplitBar({ label, parts }: { label?: string; parts: { label: string; value: number; display: string }[] }) {
  const shown = parts.filter((p) => p.value > 0);
  if (!shown.length) return null;
  return (
    <View style={{ gap: 8 }} accessibilityLabel={`${label ?? 'Split'}: ${shown.map((p) => `${p.label} ${p.display}`).join(', ')}`}>
      {label ? <Text style={T.label}>{label}</Text> : null}
      <View style={styles.split}>
        {shown.map((p, i) => (
          <View key={p.label} style={{ flex: p.value, backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length] }} />
        ))}
      </View>
      <View style={styles.legend}>
        {shown.map((p, i) => (
          <View key={p.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: SPLIT_COLORS[i % SPLIT_COLORS.length] }]} />
            <Text style={T.meta}>
              {p.label} {p.display}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Chevron() {
  return <Icon name="chevronRight" size={16} color={C.muted} />;
}

const styles = StyleSheet.create({
  headTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.ink, flex: 1 },
  score: { fontFamily: F.display, fontSize: 26, lineHeight: 31, color: C.accent },
  track: { height: 8, borderRadius: 4, backgroundColor: C.neutralChip, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: C.accent },
  fact: { gap: 4, paddingVertical: 12, minHeight: 44 },
  factTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: C.accentTint, flexShrink: 1 },
  value: { fontFamily: F.semibold, fontSize: 14, color: C.ink },
  split: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 4 },
});
