import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';

import { Brain } from '@/components/brain';
import { firstName, relativeDay, weekday } from '@/components/format';
import { Icon } from '@/components/icon';
import { Avatar, Card, EmptyCard, H1, Screen, SectionLabel } from '@/components/ui';
import { useIdeaTopics, useLeftOutToday } from '@/data/ideas';
import { C, F, S, T } from '@/theme/tokens';

type Topic = NonNullable<ReturnType<typeof useIdeaTopics>>[number];

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function Chevron({ open }: { open: boolean }) {
  const reduce = useReducedMotion();
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: reduce ? `${open ? 180 : 0}deg` : withTiming(`${open ? 180 : 0}deg`, { duration: 200 }) }],
  }));
  return (
    <Animated.View style={style}>
      <Icon name="chevronDown" size={20} color={C.mutedIcon} />
    </Animated.View>
  );
}

function Folder({ topic, open, onToggle }: { topic: Topic; open: boolean; onToggle: () => void }) {
  const meta = [
    plural(topic.conversationCount, 'conversation'),
    topic.peopleCount === 1 ? '1 person' : `${topic.peopleCount} people`,
    plural(topic.subIdeas.length, 'sub-idea'),
  ].join(' · ');
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${topic.label}, ${meta}`}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.folderHead}>
        <View style={[styles.folderTile, { backgroundColor: open ? C.accent : C.accentWash }]}>
          <Icon name="folder" size={20} color={open ? C.onAccent : C.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={T.cardTitle}>{topic.label}</Text>
          <Text style={T.meta}>{meta}</Text>
        </View>
        <Chevron open={open} />
      </Pressable>
      {open ? (
        <View style={styles.folderBody}>
          {topic.subIdeas.length ? (
            <View style={{ gap: 8 }}>
              <Text style={T.label}>Sub-ideas</Text>
              <View style={styles.tree}>
                <View style={styles.treeLine} />
                {topic.subIdeas.map((s) => (
                  <View key={s} style={styles.branchRow}>
                    <View style={styles.branch} />
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{s}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {topic.entries.length ? (
            <View style={{ gap: 10 }}>
              <Text style={T.label}>From conversations</Text>
              {topic.entries.map(({ item, person, conversation }) => {
                const when = conversation
                  ? [weekday(conversation.startedAt), conversation.place].filter(Boolean).join(' · ')
                  : relativeDay(item._creationTime);
                const who = person ? firstName(person.name) : 'Your note';
                const row = (
                  <>
                    <Avatar name={person?.name ?? 'You'} size={28} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={T.meta}>
                        {who} · {when}
                      </Text>
                      <Text style={T.bodySmall}>{item.text}</Text>
                    </View>
                  </>
                );
                const open = conversation
                  ? () => router.push({ pathname: '/conversation/[id]', params: { id: conversation._id } })
                  : person
                    ? () => router.push({ pathname: '/person/[id]', params: { id: person._id } })
                    : undefined;
                if (!open) {
                  return (
                    <View key={item._id} style={styles.entry}>
                      {row}
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={item._id}
                    accessibilityRole="button"
                    accessibilityLabel={`${who}, ${when}: ${item.text}`}
                    accessibilityHint={conversation ? 'Opens the conversation' : `Opens ${who}'s page`}
                    onPress={open}
                    style={({ pressed }) => [styles.entry, styles.entryTap, pressed && styles.entryPressed]}>
                    {row}
                    <View style={styles.entryChevron}>
                      <Icon name="chevronRight" size={18} color={C.mutedIcon} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

export default function Ideas() {
  const topics = useIdeaTopics();
  const leftOut = useLeftOutToday();
  const [picked, setPicked] = useState<string>();
  const ranked = topics ? [...topics].sort((a, b) => b.conversationCount - a.conversationCount) : [];
  const openId = picked ?? ranked[0]?._id;
  const brainTopics = ranked
    .slice(0, 4)
    .map((t) => ({ id: t._id, label: t.label, chats: t.conversationCount, subIdeas: t.subIdeas }));

  return (
    <Screen>
      <View style={{ gap: 6 }}>
        <H1>On your mind</H1>
        <Text style={[T.body, { color: C.muted }]}>
          Big-picture topics from your conversations. Small talk is left out.
        </Text>
      </View>

      {topics === undefined ? (
        <ActivityIndicator color={C.accent} />
      ) : topics.length ? (
        <>
          <Brain topics={brainTopics} selectedId={openId} onSelect={setPicked} />
          <View style={{ gap: 10 }}>
            <SectionLabel>Topics and where they branch</SectionLabel>
            {ranked.map((t) => (
              <Folder
                key={t._id}
                topic={t}
                open={t._id === openId}
                onToggle={() => setPicked(t._id === openId ? '' : t._id)}
              />
            ))}
          </View>
        </>
      ) : (
        <EmptyCard>No topics yet. They show up after a few conversations.</EmptyCard>
      )}

      <View style={styles.note}>
        <Icon name="funnel" size={18} color={C.mutedIcon} />
        <Text style={[T.bodySmall, { flex: 1, color: C.muted }]}>
          {leftOut
            ? `Left out today: ${leftOut} small-talk moments, like lunch orders and the weather. Jesse didn’t keep them.`
            : 'Nothing left out yet today.'}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  folderHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: S.touch },
  folderTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  folderBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  tree: { gap: 8, paddingLeft: 10 },
  treeLine: { position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, backgroundColor: C.chipBorder },
  branchRow: { flexDirection: 'row', alignItems: 'center' },
  branch: { width: 14, height: 2, backgroundColor: C.chipBorder },
  pill: { backgroundColor: C.accentWash, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 1 },
  pillText: { fontFamily: F.medium, fontSize: 14, lineHeight: 19, color: C.orbDeep },
  entry: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  entryTap: { marginHorizontal: -8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, minHeight: S.touch },
  entryPressed: { backgroundColor: C.accentWash },
  entryChevron: { alignSelf: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
});
