import { type Href, router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { startOfDay, time, weekday } from "@/components/format";
import { displayName, greetingLine } from "@/components/greeting";
import { Icon } from "@/components/icon";
import { Orb } from "@/components/orb";
import { RouteCard } from "@/components/route-card";
import { Button, Chip, Screen } from "@/components/ui";
import { useAskJesse, useNow, useTodayConversations } from "@/data/hooks";
import { heardSkip, heardYes, useWalkRoute, type Stop } from "@/data/walk";
import { useAlwaysOnJesse } from "@/lib/always-on";
import { localDate } from "@/lib/notifications";
import { getPref, PREF, setPref } from "@/lib/prefs";
import { useSampleConversation } from "@/lib/sample-conversation";
import { speak, stopSpeaking, useIsSpeaking } from "@/lib/voice";
import { C, F, S } from "@/theme/tokens";

const MIN_PER_STOP = 3;

export default function Home() {
  const now = useNow();
  const ask = useAskJesse();
  const speaking = useIsSpeaking();
  const route = useWalkRoute(now);
  const today = useTodayConversations(startOfDay(now));
  const sample = useSampleConversation();
  const [said, setSaid] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [cheer, setCheer] = useState(0);
  const [typing, setTyping] = useState(false);
  const [question, setQuestion] = useState("");
  const [username, setUsername] = useState<string | null | undefined>(
    undefined,
  );
  const [muted, setMuted] = useState<boolean | undefined>(undefined);
  const [stop, setStop] = useState<number | null>(null);
  const [notTonight, setNotTonight] = useState(false);
  const [busy, setBusy] = useState(false);
  const greetedOn = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const todayKey = localDate(new Date(now));

  useEffect(() => {
    void Promise.all([getPref(PREF.username), getPref(PREF.voiceMuted)]).then(
      ([name, mute]) => {
        setUsername(name);
        mutedRef.current = mute === "1";
        setMuted(mute === "1");
      },
    );
  }, []);

  const greeting =
    today === undefined || username === undefined
      ? null
      : greetingLine(displayName(username), today);

  useEffect(() => {
    if (
      greeting === null ||
      muted === undefined ||
      greetedOn.current === todayKey
    )
      return;
    greetedOn.current = todayKey;
    if (muted) return;
    void getPref(PREF.greetedOn)
      .then(async (last) => {
        if (last === todayKey || mutedRef.current) return;
        await setPref(PREF.greetedOn, todayKey);
        await speak(greeting);
      })
      .catch(() => {});
  }, [greeting, muted, todayKey]);

  const toggleMuted = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    void setPref(PREF.voiceMuted, next ? "1" : "0");
    if (next) void stopSpeaking().catch(() => {});
  };

  const askJesse = async (text: string) => {
    setThinking(true);
    try {
      const { answer } = await ask({
        question: text,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setSaid(answer);
      setCheer((n) => n + 1);
      if (!mutedRef.current) await speak(answer).catch(() => {});
    } catch {
      setSaid("Something went wrong. Ask me again.");
    } finally {
      setThinking(false);
    }
  };

  const stops = route ?? [];
  const [walk, setWalk] = useState<Stop[]>([]);
  const current = stop === null ? null : (walk[stop] ?? null);

  const goTo = useCallback(
    (index: number | null) => {
      setStop(index);
      const next = index === null ? null : walk[index];
      if (index !== null && !next) {
        setStop(null);
        setSaid("That’s the walk. Sleep well.");
        setCheer((n) => n + 1);
        if (!mutedRef.current)
          void speak("That’s the walk. Sleep well.").catch(() => {});
        return;
      }
      if (next && !mutedRef.current) void speak(next.line).catch(() => {});
    },
    [walk],
  );

  const answer = useCallback(
    async (yes: boolean) => {
      if (stop === null || !current || busy) return;
      setBusy(true);
      try {
        if (yes) {
          setCheer((n) => n + 1);
          await current.act();
        }
      } catch {}
      setBusy(false);
      if (yes && current.key === "thought") {
        setStop(null);
        return;
      }
      goTo(stop + 1);
    },
    [busy, current, goTo, stop],
  );

  const onHeard = useCallback(
    (text: string) => {
      if (stop === null) return false;
      if (heardYes(text)) {
        void answer(true);
        return true;
      }
      if (heardSkip(text)) {
        void answer(false);
        return true;
      }
      return false;
    },
    [answer, stop],
  );

  const jesse = useAlwaysOnJesse((q) => void askJesse(q), onHeard);
  const startJesse = jesse.start;
  useEffect(() => {
    void startJesse();
  }, [startJesse]);

  const sendTyped = () => {
    const text = question.trim();
    if (!text) return;
    setQuestion("");
    if (onHeard(text)) return;
    void askJesse(text);
  };

  const micOff = jesse.mode === "off" && jesse.error !== null;
  const status = speaking
    ? "Jesse is talking"
    : thinking
      ? "Thinking…"
      : jesse.mode === "capturing"
        ? "Listening"
        : jesse.mode === "waiting"
          ? stop !== null
            ? "Say “yes” or “skip”"
            : "Say “Hi Jesse” any time"
          : micOff
            ? "Microphone is off"
            : "Paused · tap Jesse to listen";
  const live = speaking || thinking || jesse.mode === "capturing";

  const statusPill = (
    <View
      style={[styles.status, live && styles.statusLive]}
      accessibilityLiveRegion="polite"
    >
      {speaking ? (
        <VoiceBars />
      ) : (
        <View style={[styles.statusDot, live && styles.statusDotLive]} />
      )}
      <Text style={[styles.statusText, live && { color: C.accentDeep }]}>
        {status}
      </Text>
    </View>
  );

  const typeRow =
    micOff || typing ? (
      <View style={styles.askRow}>
        <TextInput
          style={styles.askInput}
          value={question}
          onChangeText={setQuestion}
          placeholder={
            stop !== null
              ? "Type yes, skip, or ask Jesse"
              : "Ask Jesse anything"
          }
          placeholderTextColor={C.muted}
          returnKeyType="send"
          onSubmitEditing={sendTyped}
          accessibilityLabel="Type to Jesse"
        />
        <Button label="Send" compact onPress={sendTyped} />
      </View>
    ) : null;

  const orb = (
    <View>
      <Orb
        listening={jesse.mode === "capturing"}
        onPress={() =>
          void (jesse.mode === "off" ? jesse.start() : jesse.stop())
        }
        cheer={`${cheer}:${today?.length ?? 0}`}
        size={stop === null ? 168 : 190}
      />
      {stop === null ? (
        <Pressable
          onPress={() => router.push("/your-jesse" as Href)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Customize your Jesse"
          style={styles.customize}
        >
          <Icon name="pencil" size={15} color={C.onAccent} strokeWidth={2.2} />
        </Pressable>
      ) : null}
    </View>
  );

  if (current && stop !== null) {
    const left = (walk.length - stop) * MIN_PER_STOP;
    return (
      <Screen>
        <View style={styles.walkTop}>
          <Text style={styles.walkMeta}>
            Stop {stop + 1} of {walk.length} · {current.label}
          </Text>
          <Pressable
            onPress={() => goTo(null)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="End the walk"
          >
            <Text style={styles.walkMeta}>{left} min left · End</Text>
          </Pressable>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${((stop + 1) / walk.length) * 100}%` },
            ]}
          />
        </View>
        <View style={styles.center}>{orb}</View>
        {statusPill}
        <Animated.Text
          key={current.key}
          entering={FadeInDown.duration(400)}
          style={styles.quote}
        >
          “{current.line}”
        </Animated.Text>
        <Text style={styles.hint}>
          Just say “yes” or “skip”. You don’t need to look.
        </Text>
        {typeRow}
        <View style={styles.answerRow}>
          <Button
            label={busy ? "One sec…" : current.yes}
            onPress={() => void answer(true)}
            style={styles.answer}
            accessibilityLabel={`${current.yes} for ${current.label}`}
          />
          <Button
            label="Skip"
            variant="dark"
            onPress={() => void answer(false)}
            style={[styles.answer, styles.skip]}
          />
        </View>
      </Screen>
    );
  }

  const people = stops.filter((s) => s.key !== "thought").length;
  const hasThought = stops.some((s) => s.key === "thought");

  return (
    <Screen>
      <View style={styles.topRow}>
        <Text style={styles.meta}>
          {weekday(now)} · {time(now).toLowerCase()}
        </Text>
        <View style={styles.topActions}>
          <Pressable
            onPress={toggleMuted}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: !muted }}
            accessibilityLabel="Jesse's voice"
            style={[styles.voiceChip, muted && styles.voiceChipOff]}
          >
            <Text style={[styles.voiceChipText, muted && { color: C.muted }]}>
              {muted ? "Voice off" : "Voice on"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/connections" as Href)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={styles.gear}
          >
            <Icon name="gear" size={22} color={C.inkSoft} />
          </Pressable>
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {notTonight ? "Rest easy tonight." : "Walk home with Jesse?"}
      </Text>

      <View style={styles.center}>{orb}</View>
      <Text style={styles.greeting}>{greeting ?? " "}</Text>
      <View style={{ alignItems: "center" }}>{statusPill}</View>
      {said ? (
        <Animated.Text entering={FadeIn} style={styles.saysText}>
          “{said}”
        </Animated.Text>
      ) : null}
      {typeRow}
      {micOff || sample.running ? (
        <Pressable
          onPress={() => {
            setSaid(null);
            void sample.run().then((line) => {
              if (line) setSaid(line);
              setCheer((n) => n + 1);
            });
          }}
          disabled={sample.running}
          hitSlop={8}
          accessibilityRole="link"
          style={styles.sampleLink}
        >
          <Text
            style={[styles.sampleText, sample.running && { color: C.muted }]}
          >
            {sample.running
              ? (sample.status ?? "Listening to the sample…")
              : "Try a sample conversation"}
          </Text>
        </Pressable>
      ) : null}

      {!notTonight && stops.length > 0 ? (
        <>
          <RouteCard
            labels={["Your day", ...stops.map((s) => s.label)]}
            reached={0}
            title={`Tonight’s route · about ${stops.length * MIN_PER_STOP} minutes`}
          />
          <View style={styles.chips}>
            {people ? (
              <Chip tone="amber">{`${people} ${people === 1 ? "person" : "people"} to think about`}</Chip>
            ) : null}
            {hasThought ? <Chip tone="green">1 open question</Chip> : null}
          </View>
          <Button
            label="Start the walk"
            onPress={() => {
              setWalk(stops);
              setStop(0);
              if (!mutedRef.current) void speak(stops[0].line).catch(() => {});
            }}
            style={styles.start}
          />
          <Button
            label="Not tonight"
            variant="ghost"
            onPress={() => setNotTonight(true)}
          />
        </>
      ) : route !== undefined && !notTonight ? (
        <Text style={styles.empty}>
          No stops tonight. Talk with people and Jesse will plan tomorrow’s
          walk.
        </Text>
      ) : notTonight && stops.length > 0 ? (
        <Button
          label="Walk anyway"
          variant="ghost"
          onPress={() => setNotTonight(false)}
        />
      ) : null}

      <View style={styles.footer}>
        {!micOff ? (
          <Button
            label={typing ? "Hide keyboard" : "Type instead"}
            variant="ghost"
            compact
            onPress={() => setTyping((t) => !t)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function VoiceBars() {
  return (
    <View style={styles.bars}>
      {[8, 13, 10, 14, 7].map((h, i) => (
        <View key={i} style={[styles.bar, { height: h }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { fontFamily: F.medium, fontSize: 14, color: C.muted },
  title: {
    fontFamily: F.display,
    fontSize: 34,
    lineHeight: 40,
    color: C.ink,
    marginTop: -6,
  },
  center: { alignItems: "center", marginVertical: -18 },
  customize: {
    position: "absolute",
    right: 46,
    bottom: 44,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: C.bg,
  },
  greeting: {
    fontFamily: F.display,
    fontSize: 20,
    lineHeight: 26,
    color: C.inkSoft,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statusLive: { backgroundColor: C.accentTint },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.muted },
  statusDotLive: { backgroundColor: C.accent },
  statusText: {
    fontFamily: F.semibold,
    fontSize: 13,
    lineHeight: 17,
    color: C.muted,
  },
  bars: { flexDirection: "row", alignItems: "center", gap: 2, height: 14 },
  bar: { width: 3, borderRadius: 2, backgroundColor: C.accent },
  saysText: {
    fontFamily: F.display,
    fontSize: 18,
    lineHeight: 25,
    color: C.ink,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  askRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  askInput: {
    flex: 1,
    fontFamily: F.regular,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  start: { minHeight: 56, borderRadius: S.buttonRadius },
  empty: {
    fontFamily: F.regular,
    fontSize: 15,
    lineHeight: 21,
    color: C.muted,
    textAlign: "center",
  },
  footer: { flexDirection: "row", justifyContent: "center" },
  voiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: C.accentTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  voiceChipOff: { borderColor: C.chipBorder, backgroundColor: C.surface },
  voiceChipText: { fontFamily: F.semibold, fontSize: 12, color: C.accentDeep },
  gear: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  sampleLink: { alignSelf: "center" },
  sampleText: {
    fontFamily: F.semibold,
    fontSize: 14,
    color: C.accent,
    textDecorationLine: "underline",
  },
  walkTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walkMeta: { fontFamily: F.medium, fontSize: 14, color: C.muted },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: C.surface,
    overflow: "hidden",
    marginTop: -6,
  },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: C.accent },
  quote: { fontFamily: F.display, fontSize: 28, lineHeight: 37, color: C.ink },
  hint: { fontFamily: F.regular, fontSize: 14, color: C.muted, marginTop: -6 },
  answerRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  answer: { flex: 1, minHeight: 58, borderRadius: S.buttonRadius },
  skip: { backgroundColor: C.surface, borderColor: C.surface },
});
