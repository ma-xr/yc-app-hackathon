import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { daysSince, firstName, relativeDay } from '@/components/format';
import { Icon } from '@/components/icon';
import { Avatar, Button, Card, Chip, Divider, EmptyCard, H1, Screen, SectionLabel } from '@/components/ui';
import { useNow, usePeople } from '@/data/hooks';
import { cadenceLabel, isDrifting } from '@/data/people';
import { openComposer } from '@/lib/actions';
import { C, F, S, T } from '@/theme/tokens';

type PersonRow = NonNullable<ReturnType<typeof usePeople>>[number];

export default function People() {
  const router = useRouter();
  const people = usePeople();
  const now = useNow();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const matches = (people ?? []).filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.archetype?.toLowerCase().includes(q) ||
      p.facts.some((f) => f.toLowerCase().includes(q)),
  );
  const drifting = matches.filter((p) => isDrifting(p, now));
  const recent = matches.filter((p) => !isDrifting(p, now));
  const open = (id: PersonRow['_id']) => router.push({ pathname: '/person/[id]', params: { id } });

  return (
    <Screen>
      <H1>People</H1>
      <View style={styles.search}>
        <Icon name="search" size={18} color={C.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people or topics"
          placeholderTextColor={C.muted}
          accessibilityLabel="Search people or topics"
          style={styles.searchInput}
        />
      </View>

      {people === undefined ? (
        <ActivityIndicator color={C.accent} />
      ) : matches.length === 0 ? (
        <EmptyCard>
          {q ? 'No one matches that yet.' : 'People you talk to show up here after your first conversation.'}
        </EmptyCard>
      ) : null}

      {recent.length ? (
        <>
          <SectionLabel>Recent</SectionLabel>
          <Card style={{ paddingVertical: 4 }}>
            {recent.map((p, i) => (
              <View key={p._id}>
                {i > 0 ? <Divider /> : null}
                <RecentRow person={p} onPress={() => open(p._id)} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {drifting.length ? (
        <>
          <SectionLabel>It’s been a while</SectionLabel>
          <Card style={{ paddingVertical: 4 }}>
            {drifting.map((p, i) => (
              <View key={p._id}>
                {i > 0 ? <Divider /> : null}
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${p.name}`}
                    onPress={() => open(p._id)}
                    style={styles.rowMain}>
                    <Avatar name={p.name} size={48} dashed />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.name}>{p.name}</Text>
                      <Text style={T.meta}>
                        {daysSince(p.lastSeenAt, now)} days · you usually talk {cadenceLabel(p.cadenceDays)}
                      </Text>
                    </View>
                  </Pressable>
                  <Button
                    label="Text"
                    variant="outline"
                    accessibilityLabel={`Text ${p.name}`}
                    onPress={() => void openComposer({ phone: p.phone, body: `Hey ${firstName(p.name)}! ` })}
                  />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function RecentRow({ person, onPress }: { person: PersonRow; onPress: () => void }) {
  const owe = person.openItems.find((i) => i.kind === 'you_owe');
  const owed = person.openItems.find((i) => i.kind === 'they_owe');
  const plan = person.openItems.find((i) => i.kind === 'plan');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${person.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Avatar name={person.name} size={48} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {person.name}
          </Text>
          <Text style={[T.meta, { fontSize: 12 }]}>{relativeDay(person.lastSeenAt)}</Text>
        </View>
        {person.facts.length ? (
          <Text style={T.bodySmall} numberOfLines={1}>
            {person.facts[person.facts.length - 1]}
          </Text>
        ) : null}
        {owe ? (
          <Chip tone="accent">You owe: {owe.text}</Chip>
        ) : owed ? (
          <Chip tone="amber">Owes you: {owed.text}</Chip>
        ) : plan ? (
          <Chip tone="accent">Plan: {plan.text}</Chip>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: S.touch,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontFamily: F.regular, fontSize: 15, color: C.ink, height: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  name: { fontFamily: F.bold, fontSize: 17, color: C.ink, flexShrink: 1 },
});
