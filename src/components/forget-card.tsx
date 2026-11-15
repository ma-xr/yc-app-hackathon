import { StyleSheet, Text, View } from 'react-native';

import { firstName, relativeDay } from '@/components/format';
import { Icon } from '@/components/icon';
import { Avatar, Button, Card, Chip, type Tone } from '@/components/ui';
import { useItemActions, type ItemWithPerson } from '@/data/hooks';
import { addToCalendar, openComposer } from '@/lib/actions';
import { C, T } from '@/theme/tokens';

const KIND_CHIP: Partial<Record<ItemWithPerson['kind'], { label: string; tone: Tone }>> = {
  you_owe: { label: 'You owe', tone: 'accent' },
  they_owe: { label: 'Owes you', tone: 'amber' },
  urgent: { label: 'Small but urgent', tone: 'amber' },
  plan: { label: 'Plan', tone: 'accent' },
  question: { label: 'Open question', tone: 'green' },
};

export function ForgetCard({ item }: { item: ItemWithPerson }) {
  const { done, linkCalendar } = useItemActions();
  const { person } = item;
  const chip = KIND_CHIP[item.kind];
  const who = person ? firstName(person.name) : null;
  const due = item.dueAt ? `due ${relativeDay(item.dueAt)}` : null;

  let action: { label: string; icon: 'message' | 'calendarPlus'; run: () => void } | null = null;
  if (person && (item.kind === 'you_owe' || item.kind === 'they_owe')) {
    const body =
      item.kind === 'they_owe'
        ? `Hey ${who}! Whenever you get a sec, could you send that over?`
        : `Hey ${who}! `;
    action = {
      label: item.kind === 'they_owe' ? `Nudge ${who}` : `Text ${who}`,
      icon: 'message',
      run: () => void openComposer({ phone: person.phone, body }),
    };
  } else if (item.kind === 'urgent' || item.kind === 'plan') {
    action = {
      label: item.calendarEventId ? 'In calendar' : 'Add to calendar',
      icon: 'calendarPlus',
      run: async () => {
        const id = await addToCalendar({
          title: item.text,
          startAt: item.dueAt ?? Date.now() + 86_400_000,
        });
        if (id) await linkCalendar(item._id, id);
      },
    };
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        {person ? (
          <Avatar name={person.name} size={40} />
        ) : (
          <View style={styles.iconTile}>
            <Icon name="clock" size={20} color={C.amberDot} />
          </View>
        )}
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={T.cardTitle}>{item.text}</Text>
          <View style={styles.metaRow}>
            {chip ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}
            {due ? <Text style={T.meta}>{due}</Text> : null}
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        {action ? (
          <Button label={action.label} icon={action.icon} onPress={action.run} compact />
        ) : null}
        <Button
          label="Done"
          icon="check"
          variant="outline"
          compact
          accessibilityLabel={`Mark done: ${item.text}`}
          onPress={() => void done(item._id)}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.amberTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 8, paddingLeft: 52 },
});
