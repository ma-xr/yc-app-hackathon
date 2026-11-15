import { useAuthActions } from '@convex-dev/auth/react';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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

  const startAsking = async () => {
    if (listening.isListening) return;
    try {
      await voice.start();
      setSaid('I’m listening. Ask me anything.');
    } catch (e) {
      setSaid(e instanceof Error ? e.message : 'I couldn’t hear you.');
    }
  };

  const finishAsking = async () => {
    if (!voice.recording) return;
    setSaid('Thinking…');
    try {
      const question = await voice.stop();
      if (!question.trim()) {
        setSaid('I didn’t catch that. Hold me and ask again.');
        return;
      }
      const { answer } = await ask({
        question,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setSaid(answer);
      void speak(answer);
    } catch {
      setSaid('Something went wrong. Try asking again.');
    }
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
      </View>

      {showReflection ? <ReflectionCard question={reflection.question} /> : null}

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
  saysText: { fontFamily: F.medium, fontSize: 16, lineHeight: 23, color: C.inkSoft, textAlign: 'center' },
});
