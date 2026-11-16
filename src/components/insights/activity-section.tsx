import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Desc, FactRow, SectionHead, SplitBar, formatMins } from '@/components/insights/parts';
import { useEvidenceSheet } from '@/components/insights/sheet-context';
import type { Day } from '@/components/insights/types';
import { PlaceInsights } from '@/components/place-insights';
import { Card, Divider } from '@/components/ui';
import { C } from '@/theme/tokens';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ActivitySection({ day }: { day: Day }) {
  const open = useEvidenceSheet();
  const { activity } = day;
  const talk = activity.talkSplit;
  const talkTotal = talk.work + talk.personal + talk.logistics || 1;
  return (
    <>
      <Card style={styles.card}>
        <SectionHead title="Activity" score={activity.score} usual={activity.usual} baselineReady={day.baselineReady} />
        <Desc>{activity.desc}</Desc>
        <SplitBar
          label="Where your time went"
          parts={activity.timeSplit.map((s) => ({ label: cap(s.activityType), value: s.minutes, display: formatMins(s.minutes) }))}
        />
        <SplitBar
          label="What you talked about"
          parts={[
            { label: 'Work', value: talk.work },
            { label: 'Personal', value: talk.personal },
            { label: 'Logistics', value: talk.logistics },
          ].map((p) => ({ ...p, display: `${Math.round((p.value / talkTotal) * 100)}%` }))}
        />
        {activity.facts.map((f, i) => (
          <View key={`${f.place}-${f.activityType}`}>
            {i ? <Divider /> : null}
            <FactRow
              lead={<Icon name="pin" size={18} color={C.accent} />}
              title={f.place}
              tag={cap(f.activityType)}
              value={formatMins(f.minutes)}
              reason={f.reason}
              onPress={() => open({ title: f.place, sub: f.reason, conversationIds: f.conversationIds })}
            />
          </View>
        ))}
      </Card>
      <PlaceInsights />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
