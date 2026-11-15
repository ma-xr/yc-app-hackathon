import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Doc } from '../../convex/_generated/dataModel';
import { firstName, shortDate, time } from '@/components/format';
import { Icon } from '@/components/icon';
import { Card, Chip, type Tone } from '@/components/ui';
import { C, F, T } from '@/theme/tokens';

export function EntryCard({
  at,
  showDate,
  chip,
  title,
  detail,
  extra,
  onPress,
  accessibilityLabel,
  children,
}: {
  at: number;
  showDate?: boolean;
  chip: { label: string; tone: Tone };
  title: string;
  detail?: string;
  extra?: { text: string; color: string }[];
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: ReactNode;
}) {
  const body = (
    <Card style={styles.entry}>
      <View style={styles.when}>
        {showDate ? <Text style={styles.date}>{shortDate(at)}</Text> : null}
        <Text style={styles.time}>{time(at)}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Chip tone={chip.tone}>{chip.label}</Chip>
        <Text style={T.cardTitle}>{title}</Text>
        {detail ? <Text style={T.bodySmall}>{detail}</Text> : null}
        {extra?.map((e) => (
          <Text key={e.text} style={[styles.extra, { color: e.color }]}>
            {e.text}
          </Text>
        ))}
        {children}
      </View>
      {onPress ? <Icon name="chevronRight" size={18} color={C.muted} /> : null}
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.75 }}>
      {body}
    </Pressable>
  );
}

export type ConversationSummary = Pick<Doc<'conversations'>, '_id' | 'startedAt' | 'place' | 'gist'> & {
  people: Pick<Doc<'people'>, '_id' | 'name'>[];
  items: Pick<Doc<'items'>, '_id' | 'kind' | 'status' | 'text' | 'personId'>[];
};

export function conversationTitle(conversation: Pick<ConversationSummary, 'place' | 'people'>) {
  const names = conversation.people.map((p) => firstName(p.name));
  const withNames = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return [conversation.place ?? 'Conversation', withNames ? `with ${withNames}` : null].filter(Boolean).join(' ');
}

export function ConversationCard({ conversation, showDate }: { conversation: ConversationSummary; showDate?: boolean }) {
  const title = conversationTitle(conversation);
  const extra = conversation.items
    .filter((i) => i.status === 'open' && (i.kind === 'you_owe' || i.kind === 'they_owe'))
    .map((i) => {
      if (i.kind === 'you_owe') return { text: `You promised: ${i.text}`, color: C.accentDeep };
      const who = conversation.people.find((p) => p._id === i.personId) ?? conversation.people[0];
      return { text: `${who ? firstName(who.name) : 'They'} owes you: ${i.text}`, color: C.amberText };
    });
  return (
    <EntryCard
      at={conversation.startedAt}
      showDate={showDate}
      chip={{ label: 'Conversation', tone: 'neutral' }}
      title={title}
      detail={conversation.gist.join('\n')}
      extra={extra}
      accessibilityLabel={`Open ${title}`}
      onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: conversation._id } })}
    />
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'flex-start' },
  when: { width: 64, paddingTop: 4, gap: 2 },
  date: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.ink },
  time: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18, color: C.muted },
  extra: { fontFamily: F.semibold, fontSize: 13, lineHeight: 18 },
});
