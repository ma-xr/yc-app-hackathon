import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { firstName } from '@/components/format';
import { Chevron, Desc, FactRow, SectionHead, SplitBar, formatMins } from '@/components/insights/parts';
import { useEvidenceSheet } from '@/components/insights/sheet-context';
import type { Day } from '@/components/insights/types';
import { Avatar, Card, Divider } from '@/components/ui';

export function PeopleSection({ day }: { day: Day }) {
  const open = useEvidenceSheet();
  const { people } = day;
  const { nudge } = people;
  const split = [
    { label: 'Work', value: people.split.work },
    { label: 'Friends', value: people.split.friend },
    { label: 'Family', value: people.split.family },
    { label: 'Other', value: people.split.other },
  ].map((p) => ({ ...p, display: formatMins(p.value) }));
  return (
    <Card style={styles.card}>
      <SectionHead title="People" score={people.score} usual={people.usual} baselineReady={day.baselineReady} />
      <Desc>{people.desc}</Desc>
      <SplitBar label="Who you spent time with" parts={split} />
      {people.facts.map((f, i) => {
        const name = f.person?.name ?? 'Someone';
        return (
          <View key={f.personId}>
            {i ? <Divider /> : null}
            <FactRow
              lead={<Avatar name={name} size={28} />}
              title={name}
              tag={f.person?.roleLabel}
              value={formatMins(f.minutes)}
              reason={f.reason}
              onPress={() =>
                open({ title: name, sub: f.reason, conversationIds: f.conversationIds, personId: f.personId })
              }
            />
          </View>
        );
      })}
      {nudge ? (
        <View>
          {people.facts.length ? <Divider /> : null}
          <FactRow
            lead={<Avatar name={nudge.name} size={28} />}
            title={`Reach out to ${firstName(nudge.name)}?`}
            value={<Chevron />}
            reason={people.nudgeReason ?? `It's been a while since you talked to ${firstName(nudge.name)}.`}
            accessibilityLabel={`Reach out to ${nudge.name}`}
            onPress={() => router.push({ pathname: '/person/[id]', params: { id: nudge._id } })}
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
