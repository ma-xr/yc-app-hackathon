import { useAuthActions } from '@convex-dev/auth/react';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { startOfDay } from '@/components/format';
import { Icon } from '@/components/icon';
import { displayName, greetingLine } from '@/components/greeting';
import { Orb } from '@/components/orb';
import { Button, Screen } from '@/components/ui';
import {
  useAskJesse,
  useNow,
  useTodayConversations,
} from '@/data/hooks';
import { useAlwaysOnJesse } from '@/lib/always-on';
import { localDate, useCheckInNow } from '@/lib/notifications';
import { getPref, PREF, setPref } from '@/lib/prefs';
import { useSampleConversation } from '@/lib/sample-conversation';
import { speak, stopSpeaking, useIsSpeaking } from '@/lib/voice';
import { APP_NAME, C, F, T } from '@/theme/tokens';

export default function Home() {
  const now = useNow();
  const { signOut } = useAuthActions();
  const checkInNow = useCheckInNow();
  const ask = useAskJesse();
  const speaking = useIsSpeaking();
  const [thinking, setThinking] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [cheer, setCheer] = useState(0);
  const [typing, setTyping] = useState(false);
  const [question, setQuestion] = useState('');
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [muted, setMuted] = useState<boolean | undefined>(undefined);
  const today = useTodayConversations(startOfDay(now));
  const sample = useSampleConversation();
  const greetedOn = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const todayKey = localDate(new Date(now));

  useEffect(() => {
    void Promise.all([getPref(PREF.username), getPref(PREF.voiceMuted)]).then(([name, mute]) => {
      setUsername(name);
      mutedRef.current = mute === '1';
      setMuted(mute === '1');
    });
  }, []);

  const greeting =
    today === undefined || username === undefined ? null : greetingLine(displayName(username), today);

  useEffect(() => {
    if (greeting === null || muted === undefined || greetedOn.current === todayKey) return;
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
    void setPref(PREF.voiceMuted, next ? '1' : '0');
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
      setSaid('Something went wrong. Ask me again.');
    } finally {
      setThinking(false);
    }
  };

  const jesse = useAlwaysOnJesse((question) => void askJesse(question));
  const startJesse = jesse.start;
  useEffect(() => {
    void startJesse();
  }, [startJesse]);

  const sendTyped = () => {
    const text = question.trim();
    if (!text) return;
    setQuestion('');
    void askJesse(text);
  };

  const micOff = jesse.mode === 'off' && jesse.error !== null;
  const status = speaking
    ? 'Jesse is talking'
    : thinking
      ? 'Thinking…'
      : jesse.mode === 'capturing'
        ? 'Listening'
        : jesse.mode === 'waiting'
          ? 'Say “Hi Jesse” to start'
          : micOff
            ? 'Microphone is off'
            : 'Paused · tap Jesse to listen';
  const live = speaking || thinking || jesse.mode === 'capturing';

  return (
    <Screen>
      <View style={styles.topRow}>
        <Text style={[T.appName, { textAlign: 'center' }]} accessibilityRole="header">
          {APP_NAME}
        </Text>
        <Pressable
          onPress={toggleMuted}
          hitSlop={8}
          accessibilityRole="switch"
          accessibilityState={{ checked: !muted }}
          accessibilityLabel="Jesse's voice"
          style={[styles.voiceChip, muted && styles.voiceChipOff]}>
          <Text style={[styles.voiceChipText, muted && { color: C.muted }]}>{muted ? 'Voice off' : 'Voice on'}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/connections' as Href)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Connections and settings"
          style={styles.gear}>
          <Icon name="gear" size={22} color={C.inkSoft} />
        </Pressable>
      </View>

      <View style={styles.center}>
        <Orb
          listening={jesse.mode === 'capturing'}
          onPress={() => void (jesse.mode === 'off' ? jesse.start() : jesse.stop())}
          cheer={`${cheer}:${today?.length ?? 0}`}
          size={220}
        />
        <Text style={styles.greeting} accessibilityRole="header">
          {greeting ?? ' '}
        </Text>
        <View style={[styles.status, live && styles.statusLive]} accessibilityLiveRegion="polite">
          <View style={[styles.statusDot, live && styles.statusDotLive]} />
          <Text style={[styles.statusText, live && { color: C.accentDeep }]}>{status}</Text>
        </View>
        {said ? <Text style={styles.saysText}>{said}</Text> : null}
        {micOff || typing ? (
          <View style={styles.askRow}>
            <TextInput
              style={styles.askInput}
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask Jesse anything"
              placeholderTextColor={C.muted}
              returnKeyType="send"
              onSubmitEditing={sendTyped}
              accessibilityLabel="Type a question for Jesse"
            />
            <Button label="Ask" compact onPress={sendTyped} />
          </View>
        ) : null}
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
            style={styles.sampleLink}>
            <Text style={[styles.sampleText, sample.running && { color: C.muted }]}>
              {sample.running ? (sample.status ?? 'Listening to the sample…') : 'Try a sample conversation'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.footer}>
        {!micOff ? (
          <Button label={typing ? 'Hide keyboard' : 'Type instead'} variant="ghost" compact onPress={() => setTyping((t) => !t)} />
        ) : null}
        <Button label="Check in now" variant="ghost" compact onPress={() => void checkInNow()} />
        <Button label="Sign out" variant="ghost" compact onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  greeting: {
    fontFamily: F.display,
    fontSize: 22,
    lineHeight: 28,
    color: C.ink,
    textAlign: 'center',
    marginTop: -8,
    paddingHorizontal: 12,
    maxWidth: 360,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 16,
  },
  statusLive: { backgroundColor: C.accentTint },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.muted },
  statusDotLive: { backgroundColor: C.accent },
  statusText: { fontFamily: F.semibold, fontSize: 13, lineHeight: 17, color: C.muted },
  saysText: {
    fontFamily: F.medium,
    fontSize: 16,
    lineHeight: 23,
    color: C.inkSoft,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    maxWidth: 360,
  },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, alignSelf: 'stretch' },
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
  topRow: { justifyContent: 'center' },
  gear: { position: 'absolute', left: 0, zIndex: 1, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  voiceChip: {
    position: 'absolute',
    right: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: C.accentTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  voiceChipOff: { borderColor: C.chipBorder, backgroundColor: C.surface },
  voiceChipText: { fontFamily: F.semibold, fontSize: 12, color: C.accentDeep },
  sampleLink: { marginTop: 12 },
  sampleText: { fontFamily: F.semibold, fontSize: 14, color: C.accent, textDecorationLine: 'underline' },
});
