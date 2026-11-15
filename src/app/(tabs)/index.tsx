import { useAuthActions } from '@convex-dev/auth/react';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { ForgetCard } from '@/components/forget-card';
import { Orb } from '@/components/orb';
import { ReflectionCard } from '@/components/reflection-card';
import { Button, EmptyCard, Screen, SectionLabel } from '@/components/ui';
import {
  useAskJesse,
  useBeforeYouForget,
  useNow,
  usePeople,
  useSeedDemo,
  useTonightReflection,
} from '@/data/hooks';
import { useListening } from '@/lib/listening';
import { speak, useVoiceInput } from '@/lib/voice';
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

  const startAsking = async () => {
    if (listening.isListening) return;
    try {
      await voice.start();
      setSaid('I’m listening. Ask me anything.');
    } catch {
      setSaid('I can’t hear you here, so try typing.');
      setTyping(true);
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
      void speak(answer);
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

  const saysLine = listening.isListening
    ? (listening.status ?? 'Listening…')
    : said
      ? said
      : cards === undefined
      ? '…'
      : cards.length
        ? `${cards.length === 1 ? 'One thing' : `${cards.length} things`} worth remembering today. Hold me to ask anything.`
        : 'Tap me when a conversation starts. Hold me to ask anything.';

  return (
    <Screen>
      <Text style={[T.appName, { textAlign: 'center' }]} accessibilityRole="header">
        {APP_NAME}
      </Text>

      <View style={styles.orbArea}>
        <Orb
          listening={listening.isListening}
          onPress={() => void (listening.isListening ? listening.stop() : listening.start())}
          onLongPress={() => void startAsking()}
          onPressOut={() => void finishAsking()}
        />
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
        {typing ? (
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
      </View>

      {showReflection ? (
        <ReflectionCard question={reflection.question} />
      ) : (
        <Button
          label="Talk to Jesse"
          icon="sparkle"
          variant="outline"
          compact
          accessibilityLabel="Reflect with Jesse"
          onPress={() => router.push('/reflect')}
          style={styles.reflectEntry}
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
  reflectEntry: { alignSelf: 'center', marginTop: 4 },
  saysText: { fontFamily: F.medium, fontSize: 16, lineHeight: 23, color: C.inkSoft, textAlign: 'center' },
});
