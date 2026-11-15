import { useAuthActions } from '@convex-dev/auth/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { startOfDay } from '@/components/format';
import { ForgetCard } from '@/components/forget-card';
import { displayName, greetingLine } from '@/components/greeting';
import { Orb } from '@/components/orb';
import { ReflectionCard } from '@/components/reflection-card';
import { Button, EmptyCard, Screen, SectionLabel } from '@/components/ui';
import {
  useAskJesse,
  useBeforeYouForget,
  useNow,
  usePeople,
  useSeedDemo,
  useTodayConversations,
  useTonightReflection,
} from '@/data/hooks';
import { useListening } from '@/lib/listening';
import { localDate } from '@/lib/notifications';
import { getPref, PREF, setPref } from '@/lib/prefs';
import { useSampleConversation } from '@/lib/sample-conversation';
import { speak, stopSpeaking, useVoiceInput } from '@/lib/voice';
import { APP_NAME, C, F, T } from '@/theme/tokens';

const EVENING_HOUR = 17;

export default function Home() {
  const { evening } = useLocalSearchParams<{ evening?: string }>();
  const now = useNow();
  const listening = useListening();
  const cards = useBeforeYouForget();
  const seedDemo = useSeedDemo();
  const people = usePeople();
  const { signOut } = useAuthActions();
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
  const greeted = useRef(false);

  useEffect(() => {
    void Promise.all([getPref(PREF.username), getPref(PREF.voiceMuted)]).then(([name, mute]) => {
      setUsername(name);
      setMuted(mute === '1');
    });
  }, []);

  const greeting =
    cards === undefined || today === undefined || username === undefined
      ? null
      : greetingLine(displayName(username), today, cards);

  useEffect(() => {
    if (greeting === null || muted === undefined || greeted.current) return;
    greeted.current = true;
    if (muted) return;
    const date = localDate();
    void getPref(PREF.greetedOn)
      .then(async (last) => {
        if (last === date) return;
        await setPref(PREF.greetedOn, date);
        await speak(greeting);
      })
      .catch(() => {});
  }, [greeting, muted]);

  const toggleMuted = () => {
    const next = !muted;
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
      if (!muted) void speak(answer).catch(() => {});
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
  const reflection = useTonightReflection();
  const isEvening = evening === '1' || new Date(now).getHours() >= EVENING_HOUR;
  const showReflection = isEvening && reflection && reflection.summary === null;

  const listenFailed =
    !listening.isListening && listening.status !== null && listening.status !== 'Noting what mattered…';
  const showSample = micFailed || listenFailed || sample.status !== null;

  const saysLine = listening.isListening
    ? (listening.status ?? 'Listening…')
    : sample.status
      ? sample.status
      : listenFailed && !said
      ? 'I can’t hear you here, so try typing.'
      : said
      ? said
      : cards === undefined
      ? '…'
      : cards.length
        ? `${cards.length === 1 ? 'One thing' : `${cards.length} things`} worth remembering today. Hold me to ask anything.`
        : 'Tap me when a conversation starts. Hold me to ask anything.';

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
      </View>

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
            onPress={() => void sample.run()}
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

      {showReflection ? (
        <ReflectionCard question={reflection.question} />
      ) : (
        <Button
          label="Talk with Jesse"
          icon="sparkle"
          accessibilityLabel="Talk with Jesse"
          onPress={() => router.push('/reflect')}
          style={styles.talkButton}
        />
      )}

      <SectionLabel>Before you forget</SectionLabel>
      {cards === undefined ? (
        <ActivityIndicator color={C.accent} />
      ) : cards.length ? (
        cards.map((item) => <ForgetCard key={item._id} item={item} />)
      ) : (
        <View style={{ gap: 12 }}>
          <EmptyCard>Nothing to remember right now. You’re all caught up.</EmptyCard>
          {people?.length === 0 ? (
            <Button label="Load demo memories" variant="outline" onPress={() => void seedDemo({})} />
          ) : null}
        </View>
      )}

      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} style={{ marginTop: 16 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
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
