import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { startOfDay, weekdayDate } from '@/components/format';
import { displayName, greetingLine } from '@/components/greeting';
import { Icon } from '@/components/icon';
import { Orb } from '@/components/orb';
import { Screen } from '@/components/ui';
import { useAskJesse, useNow, useTodayConversations } from '@/data/hooks';
import { localDate } from '@/lib/notifications';
import { usePassiveCapture } from '@/lib/passive-capture';
import { getPref, PREF, setPref } from '@/lib/prefs';
import { speak, stopSpeaking, useVoiceInput } from '@/lib/voice';
import { C, F } from '@/theme/tokens';

type Turn = { role: 'user' | 'jesse'; text: string };
type Ask = (args: {
  question: string;
  timeZone?: string;
  history?: Turn[];
}) => Promise<{ answer: string; mood?: 'low' | 'stressed' | 'calm' | 'up' }>;

const MAX_HISTORY = 12;

export default function Talk() {
  const now = useNow();
  const ask = useAskJesse() as unknown as Ask;
  const voice = useVoiceInput();
  const capture = usePassiveCapture();
  const today = useTodayConversations(startOfDay(now));
  const [phase, setPhase] = useState<'idle' | 'recording' | 'thinking'>('idle');
  const [exchange, setExchange] = useState<{ you: string; jesse: string | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [cheer, setCheer] = useState(0);
  const [typing, setTyping] = useState(false);
  const [question, setQuestion] = useState('');
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [muted, setMuted] = useState<boolean | undefined>(undefined);
  const history = useRef<Turn[]>([]);
  const mutedRef = useRef(false);
  const greetedOn = useRef<string | null>(null);
  const todayKey = localDate(new Date(now));

  useEffect(() => {
    void Promise.all([getPref(PREF.username), getPref(PREF.voiceMuted)]).then(([name, mute]) => {
      setUsername(name);
      mutedRef.current = mute === '1';
      setMuted(mute === '1');
    });
  }, []);

  const greeting = today === undefined || username === undefined ? null : greetingLine(displayName(username), today);

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
    setPhase('thinking');
    setNote(null);
    setExchange({ you: text, jesse: null });
    try {
      const prior = history.current;
      const { answer, mood } = await ask({
        question: text,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(prior.length ? { history: prior } : {}),
      });
      history.current = [...prior, { role: 'user' as const, text }, { role: 'jesse' as const, text: answer }].slice(
        -MAX_HISTORY,
      );
      setExchange({ you: text, jesse: answer });
      if (mood === 'up') setCheer((n) => n + 1);
      if (!mutedRef.current) await speak(answer).catch(() => {});
    } catch {
      setExchange({ you: text, jesse: 'Sorry, I lost that. Say it again?' });
    } finally {
      setPhase('idle');
    }
  };

  const talk = async () => {
    if (phase === 'thinking') return;
    if (phase === 'idle') {
      setPhase('recording');
      setNote(null);
      try {
        await capture.holdForTalk();
        await voice.start();
      } catch (e) {
        setPhase('idle');
        setTyping(true);
        setNote(e instanceof Error ? e.message : 'The microphone isn’t available. Type instead.');
        void capture.releaseAfterTalk();
      }
      return;
    }
    if (!voice.recording) return;
    setPhase('thinking');
    let text = '';
    try {
      text = (await voice.stop()).trim();
    } catch {
      setTyping(true);
      setNote('I couldn’t hear that. Try again, or type.');
    }
    if (text) await askJesse(text);
    else setPhase('idle');
    void capture.releaseAfterTalk();
  };

  const sendTyped = () => {
    const text = question.trim();
    if (!text || phase !== 'idle') return;
    setQuestion('');
    void askJesse(text);
  };

  const recording = phase === 'recording';
  const thinking = phase === 'thinking';
  const capturePaused = capture.paused || capture.state === 'paused';
  const captureOn = capturePaused || capture.state === 'listening';

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <Text style={styles.date}>{weekdayDate(now)}</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={toggleMuted}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: !muted }}
            accessibilityLabel="Jesse's voice">
            <Text style={styles.voice}>{muted ? 'Voice off' : 'Voice on'}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/connections' as Href)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={styles.gear}>
            <Icon name="gear" size={22} color={C.mutedIcon} />
          </Pressable>
        </View>
      </View>

      <View style={styles.middle}>
        <View style={styles.orb}>
          <Orb listening={recording} onPress={() => void talk()} cheer={cheer} size={200} />
          <Pressable
            onPress={() => router.push('/your-jesse' as Href)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Customize your Jesse"
            style={styles.customize}>
            <Icon name="pencil" size={15} color={C.onAccent} strokeWidth={2.2} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.exchangeScroll}
          contentContainerStyle={styles.exchange}
          showsVerticalScrollIndicator={false}
          accessibilityLiveRegion="polite">
          {exchange ? (
            <Text style={styles.you} numberOfLines={2}>
              {exchange.you}
            </Text>
          ) : null}
          <Animated.Text key={exchange?.jesse ?? greeting ?? ''} entering={FadeIn} style={styles.reply}>
            {exchange ? (exchange.jesse ?? '') : (greeting ?? ' ')}
          </Animated.Text>
        </ScrollView>
      </View>

      <View style={styles.bottom}>
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {typing ? (
          <TextInput
            style={styles.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="Type to Jesse"
            placeholderTextColor={C.muted}
            returnKeyType="send"
            onSubmitEditing={sendTyped}
            autoFocus={typing}
            accessibilityLabel="Type to Jesse"
          />
        ) : null}
        <Text style={[styles.phase, (recording || thinking) && { color: C.accentDeep }]}>
          {recording ? 'Listening… tap to send' : thinking ? 'Thinking…' : 'Tap to talk'}
        </Text>
        <Pressable
          onPress={() => void talk()}
          disabled={thinking}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Send to Jesse' : 'Talk to Jesse'}
          accessibilityState={{ busy: thinking, selected: recording }}
          style={({ pressed }) => [
            styles.mic,
            recording && styles.micLive,
            thinking && styles.micBusy,
            pressed && { transform: [{ scale: 0.96 }] },
          ]}>
          {recording ? <View style={styles.stop} /> : <Icon name="mic" size={34} color={C.onAccent} strokeWidth={2.2} />}
        </Pressable>
        <Pressable onPress={() => setTyping((t) => !t)} hitSlop={10} accessibilityRole="button">
          <Text style={styles.link}>{typing ? 'Hide keyboard' : 'Type'}</Text>
        </Pressable>
        <View style={styles.footer}>
          {captureOn ? (
            <Pressable
              onPress={() => capture.setPaused(!capturePaused)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={capturePaused ? 'Resume background listening' : 'Pause background listening'}
              style={styles.capture}>
              <Text style={styles.status} numberOfLines={1}>
                {capturePaused ? 'Background listening paused · ' : 'Listening in the background · '}
                <Text style={styles.captureAction}>{capturePaused ? 'Resume' : 'Pause'}</Text>
              </Text>
            </Pressable>
          ) : (
            <View style={styles.capture} />
          )}
          <Pressable onPress={() => router.push('/walk' as Href)} hitSlop={10} accessibilityRole="link">
            <Text style={styles.walk}>Walk home</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  voice: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  gear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  orb: { marginVertical: -36 },
  customize: {
    position: 'absolute',
    right: 54,
    bottom: 52,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: C.bg,
  },
  exchangeScroll: { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' },
  exchange: { alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: 8, minHeight: 90 },
  you: { fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: C.muted, textAlign: 'center' },
  reply: { fontFamily: F.display, fontSize: 22, lineHeight: 30, color: C.ink, textAlign: 'center' },
  bottom: { alignItems: 'center', gap: 12, paddingBottom: 8 },
  note: { fontFamily: F.regular, fontSize: 13, color: C.amberText, textAlign: 'center' },
  input: {
    alignSelf: 'stretch',
    fontFamily: F.regular,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.surface,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  phase: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  mic: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micLive: { backgroundColor: C.accentDeep },
  micBusy: { opacity: 0.5 },
  stop: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.onAccent },
  link: { fontFamily: F.semibold, fontSize: 14, color: C.accent },
  footer: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  capture: { flex: 1 },
  status: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  captureAction: { fontFamily: F.semibold, color: C.inkSoft },
  walk: { fontFamily: F.semibold, fontSize: 12, color: C.accent },
});
