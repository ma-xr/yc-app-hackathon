import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { weekdayDate, time } from "@/components/format";
import { Button } from "@/components/ui";
import type { Id } from "../../convex/_generated/dataModel";
import { useFollowupActions } from "@/data/people";
import { openComposer } from "@/lib/actions";
import { C, F, S, T } from "@/theme/tokens";

type Suggestion = {
  _id: Id<"followups">;
  phone?: string;
  reason: string;
  sendAt: number;
  drafts: string[];
};

export function SuggestedText({
  suggestion,
  now,
}: {
  suggestion: Suggestion;
  now: number;
}) {
  const { markSent, dismiss } = useFollowupActions();
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const draft = suggestion.drafts[index] ?? "";
  const later = suggestion.sendAt > now + 3_600_000;

  const send = async () => {
    const result = await openComposer({ phone: suggestion.phone, body: draft });
    if (result === "sent") await markSent(suggestion._id, draft);
    if (result === "unknown") setConfirming(true);
  };

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.reason}>
        {later
          ? `${weekdayDate(suggestion.sendAt)} · ${time(suggestion.sendAt)} · `
          : ""}
        {suggestion.reason}
      </Text>
      <View style={styles.bubble}>
        <Text style={[T.label, { color: C.accentDeep }]}>Suggested text</Text>
        <Text style={[T.body, { color: C.ink }]}>{draft}</Text>
        {suggestion.drafts.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show another suggested text"
            onPress={() => setIndex((index + 1) % suggestion.drafts.length)}
            hitSlop={8}
          >
            <Text style={styles.another}>Try another</Text>
          </Pressable>
        ) : null}
      </View>
      {confirming ? (
        <View style={styles.actions}>
          <Text style={[T.meta, { alignSelf: "center" }]}>
            Did you send it?
          </Text>
          <Button
            label="Yes, sent"
            variant="dark"
            onPress={() => void markSent(suggestion._id, draft)}
          />
          <Button
            label="No"
            variant="outline"
            onPress={() => setConfirming(false)}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            label={later ? `Send now` : "Send"}
            icon="message"
            variant="dark"
            onPress={() => void send()}
          />
          <Button
            label="Not now"
            variant="outline"
            onPress={() => void dismiss(suggestion._id)}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  reason: {
    fontFamily: F.semibold,
    fontSize: 12,
    color: C.muted,
    textAlign: "center",
  },
  bubble: {
    alignSelf: "flex-end",
    maxWidth: 300,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: C.accent,
    backgroundColor: C.accentWash,
    borderRadius: 18,
    borderBottomRightRadius: 6,
    padding: 14,
    gap: 6,
  },
  another: {
    fontFamily: F.bold,
    fontSize: 13,
    color: C.accent,
    minHeight: S.touch / 2,
  },
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
});
