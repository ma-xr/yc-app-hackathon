import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { type ErrorBoundaryProps, router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';
import { conversationTitle } from '@/components/conversation-card';
import { firstName, time, weekdayDate } from '@/components/format';
import { Icon } from '@/components/icon';
import { Enter, Skeleton, SkeletonCard } from '@/components/motion';
import { IconButton, PressableScale } from '@/components/pressable-scale';
import { Avatar, Button, Card, Divider, EmptyCard, SectionLabel } from '@/components/ui';
import { useItemActions } from '@/data/hooks';
import { fadeIn, fadeOut, layout } from '@/theme/motion';
import { C, F, S, T } from '@/theme/tokens';

type Item = Doc<'items'>;

const GROUPS: { label: string; kinds: Item['kind'][] }[] = [
  { label: 'Promises', kinds: ['you_owe', 'they_owe'] },
  { label: 'Plans', kinds: ['plan', 'urgent'] },
  { label: 'Things Jesse noted', kinds: ['fact', 'takeaway'] },
  { label: 'Open questions', kinds: ['question'] },
];

const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

function Frame({ header, children }: { header: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton accessibilityLabel="Back" onPress={goBack}>
          <Icon name="chevronLeft" color={C.ink} />
        </IconButton>
        <View style={styles.headerText}>{header}</View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Missing({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <Frame header={null}>
      <Enter>
        <Card style={{ gap: 8, alignItems: 'flex-start' }}>
          <Text style={T.cardTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={T.bodySmall}>{body}</Text>
          <View style={{ marginTop: 4 }}>{action}</View>
        </Card>
      </Enter>
    </Frame>
  );
}

function NotFound() {
  return (
    <Missing
      title="This conversation is gone"
      body="It was deleted, or it isn’t on this account. Anything Jesse kept from it went with it."
      action={<Button compact label="Go back" haptic={false} onPress={goBack} />}
    />
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (error instanceof ConvexError && error.data === 'Not found') return <NotFound />;
  return (
    <Missing
      title="Couldn’t open this conversation"
      body="Jesse couldn’t reach your notes just now. Check your connection and try again."
      action={<Button compact label="Try again" haptic={false} onPress={() => void retry()} />}
    />
  );
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: Id<'conversations'> }>();
  const conversation = useQuery(api.conversations.get, id ? { conversationId: id } : 'skip');
  const topics = useQuery(api.topics.list, {});

  if (!id) return <NotFound />;

  if (conversation === undefined) {
    return (
      <Frame
        header={
          <View accessibilityLabel="Loading conversation" style={{ gap: 6 }}>
            <Skeleton width="70%" height={18} />
            <Skeleton width="45%" height={12} />
          </View>
        }>
        <Skeleton width={120} height={12} style={{ marginTop: 4 }} />
        <SkeletonCard lines={3} />
        <Skeleton width={90} height={12} style={{ marginTop: 4 }} />
        <SkeletonCard />
      </Frame>
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
  const groups = GROUPS.map((group) => ({ ...group, rows: items.filter((i) => group.kinds.includes(i.kind)) })).filter(
    (g) => g.rows.length,
  );
  let section = 0;

  return (
    <Frame
      header={
        <Animated.View entering={fadeIn}>
          <Text style={styles.title} accessibilityRole="header">
            {conversationTitle(conversation)}
          </Text>
          <Text style={T.meta}>
            {weekdayDate(conversation.startedAt)} · {time(conversation.startedAt)}
            {ended}
            {conversation.place ? ` · ${conversation.place}` : ''}
          </Text>
        </Animated.View>
      }>
      {conversation.location ? (
        <Enter index={section++}>
          <View
            accessible
            accessibilityLabel={`Happened at ${conversation.placeName ?? 'a pinned spot'}`}
            style={styles.person}>
            <Icon name="pin" size={20} color={C.accent} />
            <Text style={styles.personName}>{conversation.placeName ?? 'A pinned spot'}</Text>
          </View>
        </Enter>
      ) : null}

      {conversation.people.length ? (
        <Enter index={section++} style={styles.section}>
          <SectionLabel>Who was there</SectionLabel>
          <View style={styles.people}>
            {conversation.people.map((p) => (
              <PressableScale
                key={p._id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${p.name}`}
                scaleTo={0.98}
                onPress={() => router.push({ pathname: '/person/[id]', params: { id: p._id } })}
                style={styles.person}>
                <Avatar name={p.name} size={32} />
                <Text style={styles.personName}>{p.name}</Text>
                <Icon name="chevronRight" size={16} color={C.muted} />
              </PressableScale>
            ))}
          </View>
        </Enter>
      ) : null}

      <Enter index={section++} style={styles.section}>
        <SectionLabel>Jesse’s gist</SectionLabel>
        <Card style={{ gap: 8 }}>
          {conversation.gist.length ? (
            conversation.gist.map((line, i) => (
              <Animated.View key={`${i}:${line}`} entering={fadeIn} layout={layout} style={styles.gistRow}>
                <View style={styles.bullet} />
                <Text style={[T.body, { flex: 1 }]}>{line}</Text>
              </Animated.View>
            ))
          ) : (
            <Text style={[T.bodySmall, { color: C.muted }]}>
              {conversation.status !== 'done' ? 'Jesse is still listening.' : 'Nothing worth keeping came up.'}
            </Text>
          )}
        </Card>
      </Enter>

      {groups.map((group) => (
        <Enter key={group.label} index={section++} style={styles.groupSection}>
          <SectionLabel>{group.label}</SectionLabel>
          <Card style={{ paddingVertical: 4 }}>
            {group.rows.map((item, row) => (
              <Animated.View key={item._id} entering={fadeIn} exiting={fadeOut} layout={layout}>
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
              </Animated.View>
            ))}
          </Card>
        </Enter>
      ))}

      {topicNames.length ? (
        <Enter index={section++} style={styles.section}>
          <SectionLabel>Topics</SectionLabel>
          <View style={styles.topics}>
            {topicNames.map((name) => (
              <View key={name} style={styles.topic}>
                <Text style={styles.topicText}>{name}</Text>
              </View>
            ))}
          </View>
        </Enter>
      ) : null}

      {!items.length && !topicNames.length && conversation.gist.length ? (
        <Enter index={section++}>
          <EmptyCard>No promises, plans or questions came out of this one.</EmptyCard>
        </Enter>
      ) : null}

      <Animated.Text layout={layout} style={styles.footer}>
        Jesse keeps notes, not words.
      </Animated.Text>
    </Frame>
  );
}

function ItemRow({ item, prefix }: { item: Item; prefix?: string }) {
  const { edit } = useItemActions();
  const remove = useMutation(api.items.remove);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      if (draft.trim() && draft.trim() !== item.text) await edit(item._id, draft);
      setEditing(false);
    } catch {
      setError('Keep it short, a few words is plenty.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Forget this?', item.text, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forget', style: 'destructive', onPress: () => void remove({ itemId: item._id }) },
    ]);

  if (editing) {
    return (
      <Animated.View entering={fadeIn} layout={layout} style={{ paddingVertical: 8, gap: 6 }}>
        <View style={styles.row}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            accessibilityLabel="Edit this note"
            returnKeyType="done"
            editable={!saving}
            onSubmitEditing={() => void save()}
            style={styles.input}
          />
          <Button label={saving ? 'Saving…' : 'Save'} compact disabled={saving} onPress={() => void save()} />
        </View>
        {error ? (
          <Animated.Text entering={fadeIn} exiting={fadeOut} layout={layout} style={[T.meta, { color: C.amberText }]}>
            {error}
          </Animated.Text>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={fadeIn} layout={layout} style={styles.row}>
      <View style={{ flex: 1, gap: 2, paddingVertical: 10 }}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <Text style={[T.body, item.status === 'done' && styles.done]}>{item.text}</Text>
        {item.dueAt ? <Text style={T.meta}>{weekdayDate(item.dueAt)} · {time(item.dueAt)}</Text> : null}
      </View>
      <IconButton accessibilityLabel={`Edit: ${item.text}`} onPress={() => setEditing(true)}>
        <Icon name="pencil" size={16} color={C.muted} />
      </IconButton>
      <IconButton accessibilityLabel={`Delete: ${item.text}`} onPress={confirmDelete}>
        <Icon name="x" size={16} color={C.muted} />
      </IconButton>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.screenX - 8, paddingVertical: 8 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontFamily: F.bold, fontSize: 18, lineHeight: 23, color: C.ink },
  body: { padding: S.screenX, gap: 14 },
  section: { gap: 14 },
  groupSection: { gap: 10 },
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
