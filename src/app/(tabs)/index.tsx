import { useAuthActions } from '@convex-dev/auth/react';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { startOfDay, time } from '@/components/format';
import { Icon } from '@/components/icon';
import { displayName, greetingLine } from '@/components/greeting';
import { Orb } from '@/components/orb';
import { Button, Screen } from '@/components/ui';
import {
  useAskJesse,
  useNow,
  useTodayConversations,
} from '@/data/hooks';
import { useListening } from '@/lib/listening';
import { localDate, useCheckInNow } from '@/lib/notifications';
import { getPref, PREF, setPref } from '@/lib/prefs';
import { useSampleConversation } from '@/lib/sample-conversation';
import { speak, stopSpeaking, useVoiceInput } from '@/lib/voice';
import { APP_NAME, C, F, T } from '@/theme/tokens';

export default function Home() {
  const now = useNow();
  const listening = useListening();
  const { signOut } = useAuthActions();
  const checkInNow = useCheckInNow();
  const ask = useAskJesse();
  const voice = useVoiceInput();
  const [said, setSaid] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [question, setQuestion] = useState('');
  const [micFailed, setMicFailed] = useState(false);
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [muted, setMuted] = useState<boolean | undefined>(undefined);
  const today = useTodayConversations(startOfDay(now));
  const sample = useSampleConversation();
  const greetedOn = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const listeningRef = useRef(false);
  useEffect(() => {
    listeningRef.current = listening.isListening;
  }, [listening.isListening]);
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
        if (last === todayKey || mutedRef.current || listeningRef.current) return;
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

  const startAsking = async () => {
    if (listening.isListening) return;
    try {
      await voice.start();
      setSaid('I’m listening. Ask me anything.');
    } catch {
      setSaid('I can’t hear you here, so try typing.');
      setTyping(true);
      setMicFailed(true);
    }
  };

  const askJesse = async (text: string) => {
    setSaid('Thinking…');
    try {
      const { answer } = await ask({
        question: text,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setSaid(answer);
      if (!mutedRef.current) void speak(answer).catch(() => {});
    } catch {
      setSaid('Something went wrong. Try asking again.');
    }
  };

  const sendTyped = () => {
    const text = question.trim();
    if (!text) return;
    setQuestion('');
    void askJesse(text);
  };

  const finishAsking = async () => {
    if (!voice.recording) return;
    let spoken: string;
    try {
      spoken = await voice.stop();
    } catch {
      setSaid('I can’t hear you here, so try typing.');
      setTyping(true);
      setMicFailed(true);
      return;
    }
    if (!spoken.trim()) {
      setSaid('I didn’t catch that. Hold me and ask again.');
      return;
    }
    await askJesse(spoken);
  };

  const listenFailed =
    !listening.isListening && listening.status !== null && listening.status !== 'Noting what mattered…';
  const showSample = micFailed || listenFailed || sample.running;

  const saysLine = listening.isListening
    ? (listening.status ?? 'Listening…')
    : sample.running && sample.status
      ? sample.status
      : listenFailed && !said
      ? 'I can’t hear you here, so try typing.'
      : said;

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

      {listening.isListening && listening.startedAt !== null ? (
        <Pressable
          onPress={() => void listening.stop()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Listening since ${time(listening.startedAt)}. Tap to stop.`}
          style={styles.listeningPill}>
          <View style={styles.listeningDot} />
          <Text style={styles.listeningPillText}>Listening · since {time(listening.startedAt)}</Text>
        </Pressable>
      ) : null}

      <View style={styles.orbArea}>
        <Orb
          listening={listening.isListening}
          onPress={() => void (listening.isListening ? listening.stop() : listening.start())}
          onLongPress={() => void startAsking()}
          onPressOut={() => void finishAsking()}
        />
        <Text style={styles.greeting} accessibilityRole="header">
          {greeting ?? ' '}
        </Text>
        {saysLine ? (
          <View style={styles.says} accessibilityLiveRegion="polite">
          <Text style={[T.label, { textAlign: 'center' }]}>
            {listening.isListening ? 'Jesse is listening' : 'Jesse says'}
          </Text>
          <Text
            style={[
              styles.saysText,
              listening.isListening && { color: C.accentDeep, fontFamily: F.semibold },
            ]}>
            {saysLine}
          </Text>
          </View>
        ) : null}
        {typing || listenFailed ? (
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
        {showSample ? (
          <Pressable
            onPress={() => {
              setSaid(null);
              void sample.run().then((line) => line && setSaid(line));
            }}
            disabled={sample.running}
            hitSlop={8}
            accessibilityRole="link"
            style={styles.sampleLink}>
            <Text style={[styles.sampleText, sample.running && { color: C.muted }]}>
              {sample.running ? 'Listening to the sample…' : 'Try a sample conversation'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Button
        label="Talk with Jesse"
        icon="sparkle"
        accessibilityLabel="Talk with Jesse"
        onPress={() => router.push('/reflect')}
        style={styles.talkButton}
      />

      <View style={styles.footer}>
        <Button label="Check in now" variant="ghost" compact onPress={() => void checkInNow()} />
        <Button label="Sign out" variant="ghost" compact onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 16 },
  orbArea: { alignItems: 'center', marginTop: -8 },
  says: { gap: 6, paddingHorizontal: 12, marginTop: -12, maxWidth: 340 },
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
  talkButton: { minHeight: 56, borderRadius: 18, marginTop: 4 },
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
  listeningPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: C.accentTint,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 8,
  },
  listeningDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accent },
  listeningPillText: { fontFamily: F.semibold, fontSize: 12, lineHeight: 16, color: C.accentDeep },
  voiceChipOff: { borderColor: C.chipBorder, backgroundColor: C.surface },
  voiceChipText: { fontFamily: F.semibold, fontSize: 12, color: C.accentDeep },
  greeting: {
    fontFamily: F.bold,
    fontSize: 22,
    lineHeight: 28,
    color: C.ink,
    textAlign: 'center',
    marginTop: -16,
    marginBottom: 18,
    paddingHorizontal: 12,
    maxWidth: 360,
  },
  sampleLink: { marginTop: 12 },
  sampleText: { fontFamily: F.semibold, fontSize: 14, color: C.accent, textDecorationLine: 'underline' },
  saysText: { fontFamily: F.medium, fontSize: 16, lineHeight: 23, color: C.inkSoft, textAlign: 'center' },
});
