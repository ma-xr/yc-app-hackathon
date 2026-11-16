import { StyleSheet, Text, View } from 'react-native';

import { ContactAvatar } from '@/components/contacts/contact-avatar';
import { hours, monthYear, relativeAgo } from '@/components/contacts/profile/format';
import type { ContactProfile } from '@/components/contacts/profile/types';
import { C, F, S, T } from '@/theme/tokens';

export function ProfileHeader({ data, now }: { data: ContactProfile; now: number }) {
  const { person } = data;
  const relationship = data.facts.find((f) => f.kind === 'relationship')?.text;
  const subtitle = [relationship, person.knownSince ? `Known since ${monthYear(person.knownSince)}` : null]
    .filter(Boolean)
    .join(' · ');

  const lastSeen = person.lastInteractionAt ?? person.lastSeenAt;
  const stats = [
    lastSeen ? { label: 'Last seen', value: relativeAgo(lastSeen, now) } : null,
    person.totalMinutes ? { label: 'Together', value: hours(person.totalMinutes) } : null,
    person.encounterCount ? { label: 'Encounters', value: String(person.encounterCount) } : null,
    person.depthScore ? { label: 'Depth', value: `${person.depthScore.toFixed(1)}/5` } : null,
  ].filter((s): s is { label: string; value: string } => s !== null);

  return (
    <View style={styles.wrap}>
      <ContactAvatar name={person.name} photoUrl={person.photoUrl} avatarKey={person.avatarKey} size={96} />
      <Text accessibilityRole="header" style={styles.name}>
        {person.name}
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
