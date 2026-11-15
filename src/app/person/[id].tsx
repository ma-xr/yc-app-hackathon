import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConversationCard } from "@/components/conversation-card";
import { firstName, relativeDay, time, weekdayDate } from "@/components/format";
import { Icon } from "@/components/icon";
import { OrbArt } from "@/components/orb";
import { SuggestedText } from "@/components/suggested-text";
import {
  Avatar,
  Button,
  Card,
  Chip,
  Divider,
  JesseNoteTag,
  SectionLabel,
} from "@/components/ui";
import type { Id } from "../../../convex/_generated/dataModel";
import { useItemActions, useNow, usePerson } from "@/data/hooks";
import {
  archetypeLine,
  useSuggestedTexts,
  useUpdateFacts,
} from "@/data/people";
import { addToCalendar } from "@/lib/actions";
import { useVoiceInput } from "@/lib/voice";
import { C, F, S, T } from "@/theme/tokens";

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: Id<"people"> }>();
  const router = useRouter();
  const data = usePerson(id);
  const now = useNow();
  const updateFacts = useUpdateFacts();
  const { linkCalendar } = useItemActions();
  const voice = useVoiceInput();
  const [dictating, setDictating] = useState(false);
  const suggestions = useSuggestedTexts(id, now);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  const { person, items, conversations } = data;
  const first = firstName(person.name);
  const open = items.filter((i) => i.status === "open");
  const owe = open.filter((i) => i.kind === "you_owe");
  const owed = open.filter((i) => i.kind === "they_owe");
  const comingUp = open
    .filter((i) => i.dueAt !== undefined && i.dueAt >= now - 3_600_000)
    .sort((a, b) => a.dueAt! - b.dueAt!);

  const saveFacts = async (facts: string[]) => {
    setError(null);
    try {
      await updateFacts(person._id, facts);
      return true;
    } catch {
      setError("Keep each note to 12 words or fewer.");
      return false;
    }
  };

  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    if (await saveFacts([...person.facts, text])) setNote("");
  };

  const dictate = async () => {
    setError(null);
    try {
      if (!voice.recording) {
        await voice.start();
        return;
      }
      setDictating(true);
      const text = await voice.stop();
      if (text.trim()) setNote(text.trim());
    } catch {
      setError("I can’t hear you here, so try typing.");
    } finally {
      setDictating(false);
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to people"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/people")
          }
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
            {person.conversationCount} conversations · last{" "}
            {relativeDay(person.lastSeenAt)}
          </Text>
        </View>
      </View>
      <View style={styles.strip}>
        <Text style={[T.bodySmall, { color: C.muted }]}>
          {archetypeLine(person)}
        </Text>
        {owe.length + owed.length ? (
          <View style={styles.chips}>
            {owe.map((i) => (
              <Chip key={i._id} tone="accent">
                You owe: {i.text}
              </Chip>
            ))}
            {owed.map((i) => (
              <Chip key={i._id} tone="amber">
                Owes you: {i.text}
              </Chip>
            ))}
          </View>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {suggestions.length ? (
            <>
              <SectionLabel>Ready to send</SectionLabel>
              {suggestions.map((s) => (
                <SuggestedText key={s._id} suggestion={s} now={now} />
              ))}
            </>
          ) : null}

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
                      {item.kind === "you_owe" ? " · from your promise" : ""}
                    </Text>
                    {item.kind === "you_owe" || item.kind === "plan" ? (
                      item.calendarEventId ? (
                        <Chip tone="green">In your calendar</Chip>
                      ) : (
                        <Button
                          label="Add to calendar"
                          icon="calendarPlus"
                          compact
                          style={{ alignSelf: "flex-start", marginTop: 4 }}
                          onPress={async () => {
                            const eventId = await addToCalendar({
                              title: item.text,
                              startAt: item.dueAt!,
                            });
                            if (eventId) await linkCalendar(item._id, eventId);
                          }}
                        />
                      )
                    ) : null}
                  </View>
                </Card>
              ))}
            </>
          ) : null}

          <SectionLabel>Your conversations</SectionLabel>
          {conversations.length === 0 ? (
            <Text style={[T.bodySmall, { color: C.muted }]}>
              No conversations noted yet.
            </Text>
          ) : (
            conversations.map((c) => (
              <ConversationCard
                key={c._id}
                showDate
                conversation={{
                  ...c,
                  people: [person],
                  items: items.filter((i) => i.conversationId === c._id),
                }}
              />
            ))
          )}

          <SectionLabel>Jesse’s notes on {first}</SectionLabel>
          <Card style={{ paddingVertical: 4 }}>
            {person.facts.length === 0 ? (
              <Text
                style={[T.bodySmall, { color: C.muted, paddingVertical: 12 }]}
              >
                Nothing noted yet. Add a note below.
              </Text>
            ) : (
              person.facts
                .map((fact, index) => ({ fact, index }))
                .reverse()
                .map(({ fact, index }, row) => (
                  <View key={`${index}-${fact}`}>
                    {row > 0 ? <Divider /> : null}
                    <FactRow
                      text={fact}
                      onSave={(text) =>
                        saveFacts(
                          text.trim()
                            ? person.facts.map((f, i) =>
                                i === index ? text.trim() : f,
                              )
                            : person.facts.filter((_, i) => i !== index),
                        )
                      }
                    />
                  </View>
                ))
            )}
          </Card>
          {error ? (
            <Text style={[T.meta, { color: C.amberText }]}>{error}</Text>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={note}
            onChangeText={setNote}
            onSubmitEditing={() => void addNote()}
            placeholder={`Add a note about ${first}…`}
            placeholderTextColor={C.muted}
            accessibilityLabel={`Add a note about ${first}`}
            returnKeyType="done"
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              voice.recording
                ? "Stop and use what you said"
                : `Say a note about ${first}`
            }
            accessibilityState={{ busy: dictating }}
            onPress={() => void dictate()}
            style={styles.mic}
          >
            <View style={StyleSheet.absoluteFill}>
              <OrbArt size={44} id="micOrb" />
            </View>
            <Icon
              name={voice.recording ? "check" : "mic"}
              size={20}
              color="#FFFFFF"
              strokeWidth={2}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FactRow({
  text,
  onSave,
}: {
  text: string;
  onSave: (text: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  if (editing) {
    return (
      <View style={styles.factRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          accessibilityLabel="Edit Jesse's note"
          style={[styles.input, { flex: 1, height: S.touch }]}
          onSubmitEditing={async () => {
            if (await onSave(draft)) setEditing(false);
          }}
        />
        <Button
          label="Save"
          compact
          onPress={async () => {
            if (await onSave(draft)) setEditing(false);
          }}
        />
      </View>
    );
  }
  return (
    <View style={styles.factRow}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={T.body}>{text}</Text>
        <JesseNoteTag />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit note: ${text}`}
        onPress={() => {
          setDraft(text);
          setEditing(true);
        }}
        style={styles.iconButton}
      >
        <Icon name="pencil" size={18} color={C.muted} />
      </Pressable>
    </View>
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
  },
  iconButton: {
    width: S.touch,
    height: S.touch,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: F.bold, fontSize: 17, color: C.ink },
  strip: {
    backgroundColor: C.surface,
    paddingHorizontal: S.screenX,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  body: { padding: S.screenX, gap: 14, paddingBottom: 24 },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  comingUp: { flexDirection: "row", gap: 12 },
  calTile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  input: {
    flex: 1,
    height: S.touch,
    borderRadius: 22,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 16,
    fontFamily: F.regular,
    fontSize: 15,
    color: C.ink,
  },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
