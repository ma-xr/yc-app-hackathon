import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConversationCard } from "@/components/conversation-card";
import { relativeDay, time, weekdayDate } from "@/components/format";
import { Icon } from "@/components/icon";
import { Avatar, Button, Card, Chip, SectionLabel } from "@/components/ui";
import type { Id } from "../../../convex/_generated/dataModel";
import { useItemActions, useNow, usePerson } from "@/data/hooks";
import { archetypeLine } from "@/data/people";
import { addToCalendar } from "@/lib/actions";
import { C, F, S, T } from "@/theme/tokens";

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: Id<"people"> }>();
  const router = useRouter();
  const data = usePerson(id);
  const now = useNow();
  const { linkCalendar } = useItemActions();

  if (!data) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const { person, items, conversations } = data;
  const comingUp = items
    .filter((i) => i.status === "open" && i.dueAt !== undefined && i.dueAt >= now - 3_600_000)
    .sort((a, b) => a.dueAt! - b.dueAt!);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to people"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/people"))}
          style={styles.iconButton}
        >
          <Icon name="chevronLeft" color={C.ink} />
        </Pressable>
        <Avatar name={person.name} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} accessibilityRole="header">
            {person.name}
          </Text>
          <Text style={T.meta}>
            {archetypeLine(person)} · last {relativeDay(person.lastSeenAt)}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {comingUp.length ? (
          <>
            <SectionLabel>Coming up</SectionLabel>
            {comingUp.map((item) => (
              <Card key={item._id} style={styles.comingUp}>
                <View style={styles.calTile}>
                  <Icon name="calendar" size={20} color={C.accentDeep} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={T.cardTitle}>{item.text}</Text>
                  <Text style={T.meta}>
                    {weekdayDate(item.dueAt!)} · {time(item.dueAt!)}
                  </Text>
                  {item.calendarEventId ? (
                    <Chip tone="green">In your calendar</Chip>
                  ) : (
                    <Button
                      label="Add to calendar"
                      icon="calendarPlus"
                      compact
                      style={{ alignSelf: "flex-start", marginTop: 4 }}
                      onPress={async () => {
                        const eventId = await addToCalendar({ title: item.text, startAt: item.dueAt! });
                        if (eventId) await linkCalendar(item._id, eventId);
                      }}
                    />
                  )}
                </View>
              </Card>
            ))}
          </>
        ) : null}

        <SectionLabel>Your conversations</SectionLabel>
        {conversations.length === 0 ? (
          <Text style={[T.bodySmall, { color: C.muted }]}>No conversations noted yet.</Text>
        ) : (
          conversations.map((c) => (
            <ConversationCard
              key={c._id}
              showDate
              conversation={{ ...c, people: [person], items: items.filter((i) => i.conversationId === c._id) }}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  iconButton: { width: S.touch, height: S.touch, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: F.bold, fontSize: 17, color: C.ink },
  body: { padding: S.screenX, gap: 14, paddingBottom: 24 },
  comingUp: { flexDirection: "row", gap: 12 },
  calTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
});
