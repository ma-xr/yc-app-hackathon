import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { nextBirthdayInDays, type ContactProfile, type Fact } from '@/components/contacts/data';
import { inDays, monthDay, shortDate } from '@/components/contacts/profile/format';
import { C, F, S, T } from '@/theme/tokens';

const DAY = 86_400_000;

export function FactSections({ data, now }: { data: ContactProfile; now: number }) {
  const one = (f?: Fact) => (f ? [f] : []);
  const youOwe = data.openPromises.filter((p) => p.direction === 'you');
  const theyOwe = data.openPromises.filter((p) => p.direction === 'they');

  const birthday = () => {
    if (!data.birthday) return null;
    const { month, day, year } = data.birthday;
    const days = nextBirthdayInDays(data.birthday, now);
    const extra =
      days === null
        ? null
        : year
          ? `turns ${new Date(now + days * DAY).getFullYear() - year} ${inDays(days)}`
          : inDays(days);
    return <Text style={styles.value}>{[monthDay(month, day), extra].filter(Boolean).join(' · ')}</Text>;
  };

  const facts = (list: Fact[]) =>
    list.length
      ? list.map((f, i) => (
          <View key={`${f.text}-${i}`} style={styles.fact}>
            <Text style={styles.value}>{f.text}</Text>
            {f.source ? (
              <Text style={styles.caption} numberOfLines={1}>
                from {f.source.title} · {shortDate(f.source.at, now)}
              </Text>
            ) : null}
          </View>
        ))
      : null;

  const chips = (list: Fact[]) =>
    list.length ? (
      <View style={styles.chips}>
        {list.map((f) => (
          <View key={f.text} style={styles.chip}>
            <Text style={styles.chipText}>{f.text}</Text>
          </View>
        ))}
      </View>
    ) : null;

  const promises = () =>
    youOwe.length || theyOwe.length
      ? (
          [
            ['You owe', youOwe],
            ['They owe', theyOwe],
          ] as const
        ).map(([who, list]) =>
          list.map((p, i) => (
            <View key={`${who}-${i}`} style={styles.fact}>
              <Text style={styles.value}>
                <Text style={styles.promiseWho}>{who} </Text>
                {p.text}
              </Text>
              {p.dueAt ? <Text style={styles.caption}>Due {shortDate(p.dueAt, now)}</Text> : null}
            </View>
          )),
        )
      : null;

  const rows = (
    [
      ['From', facts(one(data.from))],
      ['Birthday', birthday()],
      ['Relationship', data.roleLabel ? <Text style={styles.value}>{data.roleLabel}</Text> : null],
      ['How you met', facts(one(data.howWeMet))],
      ['Working on', facts(one(data.workingOn))],
      ['What matters to them', facts(data.whatMatters)],
      ['Interests', chips(data.interests)],
      ['Family & partner', facts(data.family)],
      ['Recent life events', facts(data.lifeEvents)],
      ['Open promises', promises()],
      ['Favourite places together', facts(data.places)],
      ['Gift ideas', facts(data.giftIdeas)],
      ['Conversation style', facts(one(data.style))],
      ['Food', facts(data.food)],
      ['Avoid', facts(data.avoid)],
    ] as const
  )
    .filter(([, body]) => body !== null)
    .map(([label, body]) => (
      <Group key={label} label={label}>
        {body}
      </Group>
    ));

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
      {data.phones.length || data.emails.length ? (
        <>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Contact
          </Text>
          {data.phones.map((p) => (
            <ContactRow key={p} label="Phone" value={p} url={`tel:${p.replace(/[^+\d]/g, '')}`} />
          ))}
          {data.emails.map((e) => (
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
