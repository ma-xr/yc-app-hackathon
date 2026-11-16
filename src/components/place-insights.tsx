import { useQuery } from 'convex/react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import { Icon } from '@/components/icon';
import { useNow } from '@/data/hooks';
import { C, F, S, T } from '@/theme/tokens';

const ROUND_MS = 10 * 60_000;

export function usePlacesNow() {
  return Math.floor(useNow() / ROUND_MS) * ROUND_MS;
}

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.round(minutes / 30) / 2;
  return `${hours % 1 ? hours.toFixed(1) : hours} h`;
}

export function PlaceInsights() {
  const now = usePlacesNow();
  const lines = useQuery(api.places.insights, { now });
  if (!lines?.length) return null;
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Icon name="pin" size={14} color={C.accent} strokeWidth={2} />
        <Text style={T.label}>Where your week happened</Text>
      </View>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: S.cardRadius, padding: 16, gap: 8, borderWidth: 1, borderColor: C.line },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  line: { fontFamily: F.display, fontSize: 17, lineHeight: 23, color: C.ink },
});
