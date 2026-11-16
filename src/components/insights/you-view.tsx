import { router } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Chevron, FactRow, formatMins } from '@/components/insights/parts';
import { useEvidenceSheet } from '@/components/insights/sheet-context';
import type { Profile, Trait } from '@/components/insights/types';
import { Avatar, Button, Card, Divider, SectionLabel } from '@/components/ui';
import { C, F, T } from '@/theme/tokens';

const formatDelta = (d: number) => `${d >= 0 ? '+' : ''}${Math.round(d)}`;

export function YouView({ profile }: { profile: Profile }) {
  const open = useEvidenceSheet();
  const days = Math.min(profile.dataDays, 5);

  return (
    <>
      <Card style={styles.card}>
        <SectionLabel>Who you are, so far</SectionLabel>
        {profile.identity ? (
          <Text style={styles.display}>{profile.identity}</Text>
        ) : (
          <Text style={[T.bodySmall, { color: C.muted }]}>Too early to say much yet. Jesse is still listening.</Text>
        )}
      </Card>

      {!profile.liftsReady ? (
        <Card style={styles.card}>
          <SectionLabel>Getting to know you</SectionLabel>
          <Text style={styles.display}>{days} of 5 days</Text>
          <View style={styles.progress} accessibilityLabel={days + ' of 5 days'}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={[styles.segment, { backgroundColor: i < days ? C.accent : C.neutralChip }]} />
            ))}
          </View>
          <Text style={[T.bodySmall, { color: C.muted }]}>
            Patterns about what lifts you appear after 5 days. Telling Jesse about yourself speeds this up.
          </Text>
          <Button variant="outline" label="Tell Jesse about yourself" onPress={() => router.navigate('/')} />
        </Card>
      ) : (
        <Card style={styles.list}>
          <SectionLabel>What lifts you</SectionLabel>
          <View>
            {profile.lifts.map((l, i) => (
              <Fragment key={l.kind + ':' + l.key}>
                {i > 0 ? <Divider /> : null}
                <FactRow
                  title={l.label}
                  reason={l.note}
                  value={
                    <Text style={[styles.delta, { color: l.delta >= 0 ? C.greenText : C.amberText }]}>
                      {formatDelta(l.delta)}
                    </Text>
                  }
                  accessibilityLabel={[l.label, formatDelta(l.delta), l.note].join(', ')}
                  onPress={() => open({ title: l.label + ' · ' + formatDelta(l.delta), sub: l.note, conversationIds: [] })}
                />
              </Fragment>
            ))}
          </View>
        </Card>
      )}

      <TraitCard title="Interests" traits={profile.interests} />
      <TraitCard title="Goals" traits={profile.goals} />
      {profile.liftsReady ? (
        <TraitCard title="Personality" traits={profile.personality} />
      ) : (
        <Card style={styles.card}>
          <SectionLabel>Personality</SectionLabel>
          <Text style={[T.bodySmall, { color: C.muted }]}>Jesse needs a few more days before guessing at this</Text>
        </Card>
      )}

      {profile.orbit.length ? (
        <Card style={styles.list}>
          <SectionLabel>Your orbit</SectionLabel>
          <View>
            {profile.orbit.map((o, i) => {
              const meta = [formatMins(o.minutes) + ' this week', o.about.join(', ')].filter(Boolean).join(' · ');
              return (
                <Fragment key={o._id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={['Open ' + o.name, o.roleLabel, meta].filter(Boolean).join(', ')}
                    onPress={() => router.push({ pathname: '/person/[id]', params: { id: o._id } })}
                    style={({ pressed }) => [styles.orbitRow, pressed && { opacity: 0.7 }]}>
                    <Avatar name={o.name} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={styles.nameRow}>
                        <Text style={[T.cardTitle, { flexShrink: 1 }]} numberOfLines={1}>
                          {o.name}
                        </Text>
                        {o.roleLabel ? (
                          <View style={styles.tag}>
                            <Text style={[T.chip, { color: C.accentDeep, fontSize: 11 }]} numberOfLines={1}>
                              {o.roleLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={T.meta} numberOfLines={1}>
                        {meta}
                      </Text>
                    </View>
                    <Chevron />
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
        </Card>
      ) : null}
    </>
  );
}

function TraitCard({ title, traits }: { title: string; traits: Trait[] }) {
  const open = useEvidenceSheet();
  return (
    <Card style={traits.length ? styles.list : styles.card}>
      <SectionLabel>{title}</SectionLabel>
      {traits.length ? (
        <View>
          {traits.map((t, i) => {
            const source = t.source === 'told' ? 'You told Jesse' : t.evidenceCount + ' conversations';
            return (
              <Fragment key={t._id}>
                {i > 0 ? <Divider /> : null}
                <FactRow
                  title={t.label}
                  reason={t.reason}
                  value={<Text style={T.meta}>{source}</Text>}
                  accessibilityLabel={[t.label, source, t.reason].filter(Boolean).join(', ')}
                  onPress={() => open({ title: t.label, sub: t.reason, conversationIds: t.evidence, traitId: t._id })}
                />
              </Fragment>
            );
          })}
        </View>
      ) : (
        <Text style={[T.bodySmall, { color: C.muted }]}>
          Nothing here yet. Tell Jesse in Talk, or it will learn from your conversations.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  list: { gap: 4 },
  display: { fontFamily: F.display, fontSize: 20, lineHeight: 26, color: C.ink },
  progress: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 8, borderRadius: 4 },
  delta: { fontFamily: F.bold, fontSize: 15 },
  orbitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 44 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: C.accentTint, flexShrink: 1 },
});
