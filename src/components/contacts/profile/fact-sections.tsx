import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { inDays, monthDay, shortDate } from '@/components/contacts/profile/format';
import type { ContactFact, ContactProfile } from '@/components/contacts/profile/types';
import type { Doc } from '../../../../convex/_generated/dataModel';
import { C, F, S, T } from '@/theme/tokens';

type Kind = NonNullable<Doc<'people'>['profile']>[number]['kind'];

const GROUPS: { kind: Kind | 'birthday' | 'promises'; label: string }[] = [
  { kind: 'from', label: 'From' },
  { kind: 'birthday', label: 'Birthday' },
  { kind: 'relationship', label: 'Relationship' },
  { kind: 'how_met', label: 'How you met' },
  { kind: 'working_on', label: 'Working on' },
  { kind: 'matters', label: 'What matters to them' },
  { kind: 'interest', label: 'Interests' },
  { kind: 'family', label: 'Family & partner' },
  { kind: 'life_event', label: 'Recent life events' },
  { kind: 'promises', label: 'Open promises' },
  { kind: 'place', label: 'Favourite places together' },
  { kind: 'gift_idea', label: 'Gift ideas' },
  { kind: 'style', label: 'Conversation style' },
  { kind: 'food', label: 'Food' },
  { kind: 'avoid', label: 'Avoid' },
];

export function FactSections({ data, now }: { data: ContactProfile; now: number }) {
  const { person, promises } = data;
  const byKind = new Map<Kind, ContactFact[]>();
  for (const fact of data.facts) byKind.set(fact.kind, [...(byKind.get(fact.kind) ?? []), fact]);

  const rows = GROUPS.map(({ kind, label }) => {
    if (kind === 'birthday') {
      if (!person.birthday) return null;
      const { month, day } = person.birthday;
      const days = data.nextBirthdayInDays;
      const extra =
        days === null
          ? null
          : data.age === null
            ? inDays(days)
            : `turns ${days === 0 ? data.age : data.age + 1} ${inDays(days)}`;
      return (
        <Group key={kind} label={label}>
          <Text style={styles.value}>{[monthDay(month, day), extra].filter(Boolean).join(' · ')}</Text>
        </Group>
      );
    }
    if (kind === 'promises') {
      if (!promises.youOwe.length && !promises.theyOwe.length) return null;
      return (
        <Group key={kind} label={label}>
          {(
            [
              ['You owe', promises.youOwe],
              ['They owe', promises.theyOwe],
            ] as const
          ).map(([who, list]) =>
            list.map((p) => (
              <View key={p._id} style={styles.fact}>
                <Text style={styles.value}>
                  <Text style={styles.promiseWho}>{who} </Text>
                  {p.text}
                </Text>
                {p.dueAt ? <Text style={styles.caption}>Due {shortDate(p.dueAt, now)}</Text> : null}
              </View>
            )),
          )}
        </Group>
      );
    }
    const facts = byKind.get(kind);
    if (!facts?.length) return null;
    if (kind === 'interest') {
      return (
        <Group key={kind} label={label}>
          <View style={styles.chips}>
            {facts.map((f) => (
              <View key={f.text} style={styles.chip}>
                <Text style={styles.chipText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </Group>
      );
    }
    return (
      <Group key={kind} label={label}>
        {facts.map((f) => (
          <View key={`${f.text}-${f.learnedAt}`} style={styles.fact}>
            <Text style={styles.value}>{f.text}</Text>
            {f.source ? (
              <Text style={styles.caption} numberOfLines={1}>
                from {f.source.title} · {shortDate(f.source.startedAt, now)}
              </Text>
            ) : null}
          </View>
        ))}
      </Group>
    );
  }).filter((r) => r !== null);

  const phones = person.phones?.length ? person.phones : person.phone ? [person.phone] : [];
  const emails = person.emails ?? [];

  return (
    <View>
      {rows.length ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            About
          </Text>
          {rows}
        </>
      ) : null}
      {phones.length || emails.length ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Contact
          </Text>
          {phones.map((p) => (
            <ContactRow key={p} label="Phone" value={p} url={`tel:${p.replace(/[^+\d]/g, '')}`} />
          ))}
          {emails.map((e) => (
            <ContactRow key={e} label="Email" value={e} url={`mailto:${e}`} />
          ))}
        </>
      ) : null}
    </View>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function ContactRow({ label, value, url }: { label: string; value: string; url: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label === 'Phone' ? 'Call' : 'Email'} ${value}`}
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => [styles.group, styles.contactRow, pressed && { opacity: 0.6 }]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, styles.link]} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { ...T.appName, marginTop: 40, marginBottom: 4, paddingHorizontal: S.screenX },
  group: {
    marginHorizontal: S.screenX,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  groupBody: { gap: 10, marginTop: 6 },
  label: { ...T.label, fontSize: 11, letterSpacing: 0.8 },
  fact: { gap: 2 },
  value: { fontFamily: F.regular, fontSize: 16, lineHeight: 23, color: C.ink },
  caption: { fontFamily: F.regular, fontSize: 12, lineHeight: 16, color: C.muted },
  promiseWho: { fontFamily: F.semibold, color: C.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.chipBorder,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipText: { fontFamily: F.medium, fontSize: 13, lineHeight: 17, color: C.inkSoft },
  contactRow: { minHeight: S.touch },
  link: { color: C.accentDeep, marginTop: 4 },
});
