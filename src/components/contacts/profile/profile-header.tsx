import { StyleSheet, Text, View } from 'react-native';

import { ContactAvatar } from '@/components/contacts/contact-avatar';
import type { ContactProfile } from '@/components/contacts/data';
import { hours, monthYear, relativeAgo } from '@/components/contacts/profile/format';
import { C, F, S, T } from '@/theme/tokens';

export function ProfileHeader({ data, now }: { data: ContactProfile; now: number }) {
  const subtitle = [data.roleLabel, data.knownSince ? `Known since ${monthYear(data.knownSince)}` : null]
    .filter(Boolean)
    .join(' · ');

  const stats = [
    data.lastInteractionAt ? { label: 'Last seen', value: relativeAgo(data.lastInteractionAt, now) } : null,
    data.totalMinutes ? { label: 'Together', value: hours(data.totalMinutes) } : null,
    data.encounterCount ? { label: 'Encounters', value: String(data.encounterCount) } : null,
    data.distinctTopicCount ? { label: 'Topics', value: String(data.distinctTopicCount) } : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

  return (
    <View style={styles.wrap}>
      <ContactAvatar name={data.name} photoUrl={data.photoUrl} avatarKey={data.avatarKey} size={96} />
      <Text accessibilityRole="header" style={styles.name}>
        {data.name}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {stats.length ? (
        <View style={styles.stats}>
          {stats.map((s, i) => (
            <View
              key={s.label}
              accessible
              accessibilityLabel={`${s.label}: ${s.value}`}
              style={[styles.stat, i > 0 && styles.statDivider]}>
              <Text style={styles.statValue} numberOfLines={1}>
                {s.value}
              </Text>
              <Text style={styles.statLabel} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 8, paddingHorizontal: S.screenX },
  name: { ...T.h1, fontSize: 34, lineHeight: 40, marginTop: 18, textAlign: 'center' },
  subtitle: { ...T.meta, fontSize: 14, marginTop: 6, textAlign: 'center' },
  stats: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    marginTop: 28,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.line },
  statValue: { fontFamily: F.display, fontSize: 19, lineHeight: 24, color: C.ink },
  statLabel: { fontFamily: F.medium, fontSize: 11, lineHeight: 14, color: C.muted, letterSpacing: 0.3 },
});
