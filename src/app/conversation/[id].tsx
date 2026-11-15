import { useMutation, useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { conversationTitle } from '@/components/conversation-card';
import { firstName, time, weekdayDate } from '@/components/format';
import { Icon } from '@/components/icon';
import { Avatar, Button, Card, Divider, EmptyCard, SectionLabel } from '@/components/ui';
import { useItemActions } from '@/data/hooks';
import { C, F, S, T } from '@/theme/tokens';

type Item = Doc<'items'>;

const GROUPS: { label: string; kinds: Item['kind'][] }[] = [
  { label: 'Promises', kinds: ['you_owe', 'they_owe'] },
  { label: 'Plans', kinds: ['plan', 'urgent'] },
  { label: 'Things Jesse noted', kinds: ['fact', 'takeaway'] },
  { label: 'Open questions', kinds: ['question'] },
];

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: Id<'conversations'> }>();
  const conversation = useQuery(api.conversations.get, id ? { conversationId: id } : 'skip');
  const topics = useQuery(api.topics.list, {});

  if (conversation === undefined) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const ended = conversation.endedAt && time(conversation.endedAt) !== time(conversation.startedAt) ? ` – ${time(conversation.endedAt)}` : '';
  const items = conversation.items.filter((i) => i.status !== 'dismissed');
  const topicNames = (topics ?? [])
    .filter((t) => conversation.topicIds?.includes(t._id) || items.some((i) => i.topicId === t._id))
    .map((t) => t.label);
  const who = (personId?: Id<'people'>) => {
    const person = conversation.people.find((p) => p._id === personId);
    return person ? firstName(person.name) : 'They';
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/plans'))}
          style={styles.iconButton}>
          <Icon name="chevronLeft" color={C.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">
            {conversationTitle(conversation)}
          </Text>
          <Text style={T.meta}>
            {weekdayDate(conversation.startedAt)} · {time(conversation.startedAt)}
            {ended}
            {conversation.place ? ` · ${conversation.place}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {conversation.people.length ? (
          <>
            <SectionLabel>Who was there</SectionLabel>
            <View style={styles.people}>
              {conversation.people.map((p) => (
                <Pressable
                  key={p._id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${p.name}`}
                  onPress={() => router.push({ pathname: '/person/[id]', params: { id: p._id } })}
                  style={({ pressed }) => [styles.person, pressed && { opacity: 0.75 }]}>
                  <Avatar name={p.name} size={32} />
                  <Text style={styles.personName}>{p.name}</Text>
                  <Icon name="chevronRight" size={16} color={C.muted} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <SectionLabel>Jesse’s gist</SectionLabel>
        <Card style={{ gap: 8 }}>
          {conversation.gist.length ? (
            conversation.gist.map((line) => (
              <View key={line} style={styles.gistRow}>
                <View style={styles.bullet} />
                <Text style={[T.body, { flex: 1 }]}>{line}</Text>
              </View>
            ))
          ) : (
            <Text style={[T.bodySmall, { color: C.muted }]}>
              {conversation.status !== 'done' ? 'Jesse is still listening.' : 'Nothing worth keeping came up.'}
            </Text>
          )}
        </Card>

        {GROUPS.map((group) => {
          const rows = items.filter((i) => group.kinds.includes(i.kind));
          if (!rows.length) return null;
          return (
            <View key={group.label} style={{ gap: 10 }}>
              <SectionLabel>{group.label}</SectionLabel>
              <Card style={{ paddingVertical: 4 }}>
                {rows.map((item, row) => (
                  <View key={item._id}>
                    {row > 0 ? <Divider /> : null}
                    <ItemRow
                      item={item}
                      prefix={
                        item.kind === 'you_owe'
                          ? 'You promised'
                          : item.kind === 'they_owe'
                            ? `${who(item.personId)} owes you`
                            : item.kind === 'urgent'
                              ? 'Small but urgent'
                              : undefined
                      }
                    />
                  </View>
                ))}
              </Card>
            </View>
          );
        })}

        {topicNames.length ? (
          <>
            <SectionLabel>Topics</SectionLabel>
            <View style={styles.topics}>
              {topicNames.map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${name} in Ideas`}
                  onPress={() => router.push('/ideas')}
                  style={styles.topic}>
                  <Text style={styles.topicText}>{name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {!items.length && !topicNames.length && conversation.gist.length ? (
          <EmptyCard>No promises, plans or questions came out of this one.</EmptyCard>
        ) : null}

        <Text style={styles.footer}>Jesse keeps notes, not words.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ItemRow({ item, prefix }: { item: Item; prefix?: string }) {
  const { edit } = useItemActions();
  const remove = useMutation(api.items.remove);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      if (draft.trim() && draft.trim() !== item.text) await edit(item._id, draft);
      setEditing(false);
    } catch {
      setError('Keep it short, a few words is plenty.');
    }
  };

  const confirmDelete = () =>
    Alert.alert('Forget this?', item.text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forget', style: 'destructive', onPress: () => void remove({ itemId: item._id }) },
    ]);

  if (editing) {
    return (
      <View style={{ paddingVertical: 8, gap: 6 }}>
        <View style={styles.row}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            accessibilityLabel="Edit this note"
            onSubmitEditing={() => void save()}
            style={styles.input}
          />
          <Button label="Save" compact onPress={() => void save()} />
        </View>
        {error ? <Text style={[T.meta, { color: C.amberText }]}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2, paddingVertical: 10 }}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <Text style={[T.body, item.status === 'done' && styles.done]}>{item.text}</Text>
        {item.dueAt ? <Text style={T.meta}>{weekdayDate(item.dueAt)} · {time(item.dueAt)}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit: ${item.text}`} onPress={() => setEditing(true)} style={styles.small}>
        <Icon name="pencil" size={16} color={C.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Delete: ${item.text}`} onPress={confirmDelete} style={styles.small}>
        <Icon name="x" size={16} color={C.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.screenX - 8, paddingVertical: 8 },
  iconButton: { width: S.touch, height: S.touch, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.bold, fontSize: 18, lineHeight: 23, color: C.ink },
  body: { padding: S.screenX, gap: 14, paddingBottom: 32 },
  people: { gap: 8 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: S.touch,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: C.surface,
  },
  personName: { flex: 1, fontFamily: F.semibold, fontSize: 15, color: C.ink },
  gistRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prefix: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.accentDeep },
  done: { textDecorationLine: 'line-through', color: C.muted },
  small: { width: 36, height: S.touch, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    fontFamily: F.regular,
    fontSize: 15,
    color: C.ink,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: S.touch,
  },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topic: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  topicText: { fontFamily: F.semibold, fontSize: 13, color: C.ink },
  footer: { textAlign: 'center', fontFamily: F.medium, fontSize: 13, color: C.muted, marginTop: 8 },
});
