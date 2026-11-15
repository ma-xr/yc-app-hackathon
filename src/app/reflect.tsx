import { useAction, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import {
  formatCheckInTime,
  getCheckInSettings,
  localDate,
  saveCheckInSettings,
  type CheckInSettings,
} from '@/lib/notifications';
import { speak, stopSpeaking, useVoiceInput } from '@/lib/voice';

const C = {
  bg: '#F6F5FB',
  surface: '#FFFFFF',
  ink: '#1B1830',
  inkSoft: '#3B3752',
  muted: '#5E5A72',
  line: '#E4E1F0',
  chipBorder: '#DCD8EC',
  accent: '#5A48D6',
  accentDeep: '#3E2FB0',
  accentTint: '#E7E3FB',
  accentWash: '#EFECFC',
  darkCardMuted: '#B9B4D1',
};

const HEADING = Platform.select({ ios: 'ui-rounded', default: undefined });

const CHECK_IN_TIMES = [
  { hour: 20, minute: 30 },
  { hour: 21, minute: 0 },
  { hour: 21, minute: 30 },
  { hour: 22, minute: 0 },
];

type Turn = { role: 'jesse' | 'user'; text: string };

export default function ReflectScreen() {
  const date = localDate();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tonight = useQuery(api.reflections.tonight, { date });
  const reply = useAction(api.reflections.reply);
  const voice = useVoiceInput();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [checkIn, setCheckIn] = useState<CheckInSettings | null>(null);

  useEffect(() => {
    void getCheckInSettings().then(setCheckIn);
    return () => void stopSpeaking();
  }, []);

  const send = async (text: string, spoken: boolean) => {
    const message = text.trim();
    if (!message || !tonight || thinking) {
      return;
    }
    setError(null);
    setDraft('');
    setThinking(true);
    const history = turns;
    setTurns([...history, { role: 'user', text: message }]);
    try {
      const result = await reply({
        date,
        question: tonight.question,
        topicId: tonight.topicId ?? undefined,
        history,
        message,
        timeZone,
      });
      setTurns([...history, { role: 'user', text: message }, { role: 'jesse', text: result.reply }]);
      if (spoken || voiceReplies) {
        void speak(result.reply);
      }
    } catch {
      setTurns(history);
      setDraft(message);
      setError("Jesse couldn't answer just now. Try again in a moment.");
    } finally {
      setThinking(false);
    }
  };

  const toggleMic = async () => {
    setError(null);
    try {
      if (!voice.recording) {
        await voice.start();
        return;
      }
      setVoiceReplies(true);
      const text = await voice.stop();
      if (text) {
        await send(text, true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Jesse couldn't hear that.");
    }
  };

  const chooseTime = async (time: { hour: number; minute: number } | null) => {
    const next = time ? { enabled: true, ...time } : { ...(checkIn ?? CHECK_IN_TIMES[2]), enabled: false };
    setCheckIn(next);
    await saveCheckInSettings(next, tonight?.summary === null ? tonight.question : null);
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.orb} accessibilityElementsHidden />
          <View style={styles.flex}>
            <Text style={styles.name}>Jesse</Text>
            <Text style={styles.meta}>Tonight · {today}</Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: voiceReplies }}
            accessibilityLabel="Read Jesse's replies out loud"
            onPress={() => {
              if (voiceReplies) {
                void stopSpeaking();
              }
              setVoiceReplies(!voiceReplies);
            }}
            style={[styles.chip, voiceReplies && styles.chipOn]}>
            <Text style={[styles.chipText, voiceReplies && styles.chipTextOn]}>{voiceReplies ? 'Voice on' : 'Voice off'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close reflection" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={styles.close}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
          <View style={styles.questionCard}>
            <Text style={styles.questionLabel}>TONIGHT&apos;S REFLECTION</Text>
            {tonight === undefined ? (
              <ActivityIndicator color={C.surface} />
            ) : (
              <Text style={styles.question}>{tonight?.question ?? 'Sign in to talk with Jesse.'}</Text>
            )}
            <Text style={styles.questionHint}>Take your time. Talk or type, whatever feels easier.</Text>
          </View>

          {turns.map((turn, index) => (
            <View
              key={index}
              style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.jesseBubble]}
              accessibilityLabel={`${turn.role === 'user' ? 'You' : 'Jesse'}: ${turn.text}`}>
              <Text style={turn.role === 'user' ? styles.userText : styles.jesseText}>{turn.text}</Text>
            </View>
          ))}

          {thinking && (
            <View style={[styles.bubble, styles.jesseBubble]}>
              <Text style={styles.thinking}>Jesse is thinking…</Text>
            </View>
          )}

          {tonight?.summary && (
            <View style={styles.keepCard}>
              <Text style={styles.sectionLabel}>WHAT JESSE KEEPS</Text>
              <Text style={styles.keepText}>{tonight.summary}</Text>
              <Text style={styles.keepNote}>Only this short note is saved. Never the conversation.</Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.checkInCard}>
            <Text style={styles.sectionLabel}>EVENING CHECK-IN</Text>
            <Text style={styles.checkInText}>
              {checkIn?.enabled === false
                ? 'Off. Jesse won’t nudge you in the evening.'
                : `Jesse asks “Got a minute?” at ${formatCheckInTime(checkIn ?? CHECK_IN_TIMES[2] as CheckInSettings)}. It shows on your Watch too.`}
            </Text>
            <View style={styles.chips}>
              {CHECK_IN_TIMES.map((time) => {
                const on = checkIn?.enabled !== false && checkIn?.hour === time.hour && checkIn?.minute === time.minute;
                return (
                  <Pressable
                    key={`${time.hour}:${time.minute}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => void chooseTime(time)}
                    style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {formatCheckInTime({ enabled: true, ...time })}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: checkIn?.enabled === false }}
                onPress={() => void chooseTime(null)}
                style={[styles.chip, checkIn?.enabled === false && styles.chipOn]}>
                <Text style={[styles.chipText, checkIn?.enabled === false && styles.chipTextOn]}>Off</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={voice.recording ? 'Listening… tap the mic when you’re done' : 'Tell Jesse what you think'}
            placeholderTextColor={C.muted}
            multiline
            editable={!voice.recording}
            accessibilityLabel="Your reply to Jesse"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={voice.recording ? 'Stop and send' : 'Talk to Jesse'}
            onPress={() => void toggleMic()}
            disabled={thinking || !tonight}
            style={[styles.roundButton, voice.recording ? styles.micOn : styles.micOff]}>
            <Text style={[styles.talkText, !voice.recording && { color: C.accentDeep }]}>{voice.recording ? 'Send' : 'Talk'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            onPress={() => void send(draft, false)}
            disabled={thinking || !draft.trim()}
            style={[styles.roundButton, styles.send, (thinking || !draft.trim()) && styles.disabled]}>
            <Text style={styles.roundIcon}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  orb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.accent,
    backgroundImage:
      'radial-gradient(circle at 34% 28%, #FFFFFF 0%, #D4CCFF 16%, #8E80F5 42%, #5A48D6 70%, #2A1F7A 100%)',
  },
  name: { fontFamily: HEADING, fontSize: 26, fontWeight: '700', color: C.ink },
  meta: { fontSize: 13, fontWeight: '500', color: C.muted, marginTop: 2 },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  closeText: { fontSize: 15, fontWeight: '700', color: C.accent },
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  questionCard: { backgroundColor: C.ink, borderRadius: 20, padding: 20, gap: 10 },
  questionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.72, color: C.darkCardMuted },
  question: { fontFamily: HEADING, fontSize: 20, lineHeight: 26, fontWeight: '700', color: C.surface },
  questionHint: { fontSize: 13, color: C.darkCardMuted },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12 },
  jesseBubble: {
    alignSelf: 'flex-start',
    backgroundColor: C.surface,
    borderBottomLeftRadius: 6,
    boxShadow: '0 1px 2px rgba(27,24,48,0.06)',
  },
  userBubble: { alignSelf: 'flex-end', backgroundColor: C.accentTint, borderBottomRightRadius: 6 },
  jesseText: { fontSize: 15, lineHeight: 21, color: C.inkSoft },
  userText: { fontSize: 15, lineHeight: 21, color: C.accentDeep },
  thinking: { fontSize: 14, color: C.muted, fontStyle: 'italic' },
  keepCard: { backgroundColor: C.accentWash, borderRadius: 18, padding: 16, gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.72, color: C.muted },
  keepText: { fontSize: 15, lineHeight: 21, color: C.ink },
  keepNote: { fontSize: 12, color: C.muted },
  error: { fontSize: 14, color: '#7A3E06', backgroundColor: '#FCEBD3', borderRadius: 12, padding: 12 },
  checkInCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    boxShadow: '0 1px 2px rgba(27,24,48,0.06)',
  },
  checkInText: { fontSize: 14, lineHeight: 20, color: C.inkSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.chipBorder,
    backgroundColor: C.surface,
  },
  chipOn: { backgroundColor: C.accentTint, borderColor: C.accentTint },
  chipText: { fontSize: 12, fontWeight: '700', color: C.inkSoft },
  chipTextOn: { color: C.accentDeep },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.bg,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: C.ink,
  },
  roundButton: { minWidth: 44, height: 44, borderRadius: 22, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  talkText: { fontSize: 13, fontWeight: '700', color: C.surface },
  micOff: { backgroundColor: C.accentTint },
  micOn: { backgroundColor: '#B5650F' },
  send: { backgroundColor: C.accent },
  disabled: { opacity: 0.4 },
  roundIcon: { fontSize: 18, fontWeight: '700', color: C.surface },
});
