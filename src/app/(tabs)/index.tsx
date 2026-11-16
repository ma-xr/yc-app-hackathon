import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { startOfDay, weekdayDate } from '@/components/format';
import { displayName, greetingLine } from '@/components/greeting';
import { Icon } from '@/components/icon';
import { Orb } from '@/components/orb';
import { IconButton, PressableScale, slopFor } from '@/components/pressable-scale';
import { Screen } from '@/components/ui';
import { useAskJesse, useNow, useTodayConversations } from '@/data/hooks';
import { localDate } from '@/lib/notifications';
import { usePassiveCapture } from '@/lib/passive-capture';
import { getPref, PREF, setPref } from '@/lib/prefs';
import { speak, stopSpeaking, useVoiceInput } from '@/lib/voice';
import { enter, fadeIn, fadeOut, haptic, layout, SPRING } from '@/theme/motion';
import { C, F, S } from '@/theme/tokens';

type Turn = { role: 'user' | 'jesse'; text: string };
type Ask = (args: {
  question: string;
  timeZone?: string;
  history?: Turn[];
}) => Promise<{ answer: string; mood?: 'low' | 'stressed' | 'calm' | 'up' }>;

const MAX_HISTORY = 12;
const ORB = 200;
const BADGE = 34;
// Room the reply text needs under the orb before the orb starts shrinking to make space.
const TEXT_ROOM = 120;
const TEXT_ROOM_EXCHANGE = 170;
const MIN_SCALE = 0.45;

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

function Dot({ index }: { index: number }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const half = { duration: 420, easing: Easing.inOut(Easing.sin) };
    pulse.value = withDelay(index * 140, withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), -1));
  }, [index, pulse, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * pulse.value,
    transform: [{ translateY: -4 * pulse.value }],
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

function ThinkingDots() {
  return (
    <Animated.View entering={fadeIn} exiting={fadeOut} style={styles.dots} accessibilityLabel="Jesse is thinking">
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} />
      ))}
    </Animated.View>
  );
}

function OrbSlot({ scale, orb, badge: edit }: { scale: number; orb: ReactNode; badge: ReactNode }) {
  const s = useSharedValue(scale);
  useEffect(() => {
    s.value = withSpring(scale, SPRING.gentle);
  }, [s, scale]);
  const slot = useAnimatedStyle(() => ({ height: ORB * s.value + 28 }));
  const art = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const badge = useAnimatedStyle(() => ({
    transform: [{ translateX: (ORB / 2) * s.value - 21 }, { translateY: (ORB / 2) * s.value - 19 }],
  }));
  return (
    <Animated.View style={[styles.orbSlot, slot]}>
      <Animated.View style={art}>{orb}</Animated.View>
      <Animated.View pointerEvents="box-none" style={[styles.badgeAnchor, badge]}>
        {edit}
      </Animated.View>
    </Animated.View>
  );
}

export default function Talk() {
  const now = useNow();
  const ask = useAskJesse() as unknown as Ask;
  const voice = useVoiceInput();
  const capture = usePassiveCapture();
  const today = useTodayConversations(startOfDay(now));
  const [phase, setPhase] = useState<'idle' | 'recording' | 'thinking'>('idle');
  const [exchange, setExchange] = useState<{
    you: string;
    jesse: string | null;
  } | null>(null);
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
  const keyboardUp = useKeyboardVisible();
  const [middleH, setMiddleH] = useState(0);

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
      const prior: Turn[] = history.current.length ? history.current : greeting ? [{ role: 'jesse', text: greeting }] : [];
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
      haptic('light');
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
    haptic('light');
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
    haptic('light');
    setQuestion('');
    void askJesse(text);
  };

  const recording = phase === 'recording';
  const thinking = phase === 'thinking';
  const capturePaused = capture.paused || capture.state === 'paused';
  const captureOn = capturePaused || capture.state === 'listening';
  const compact = typing && keyboardUp;
  const reply = exchange ? exchange.jesse : greeting;
  const wanted = compact ? 0.5 : exchange || typing ? 0.75 : 1;
  // Short screens (small phones, the web demo frame): shrink the orb so the reply always has room.
  const fits = middleH > 0 ? (middleH - (exchange ? TEXT_ROOM_EXCHANGE : TEXT_ROOM) - 28) / ORB : wanted;
  const orbScale = Math.max(MIN_SCALE, Math.min(wanted, fits));

  return (
    <Screen scroll={false} keyboard contentStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.date} numberOfLines={1}>
          {weekdayDate(now)}
        </Text>
        <View style={styles.headerActions}>
          <PressableScale
            onPress={toggleMuted}
            accessibilityRole="switch"
            accessibilityState={{ checked: !muted }}
            accessibilityLabel="Jesse's voice"
            style={styles.voiceHit}>
            <Text style={styles.voice}>{muted ? 'Voice off' : 'Voice on'}</Text>
          </PressableScale>
          <IconButton accessibilityLabel="Settings" onPress={() => router.push('/connections' as Href)}>
            <Icon name="gear" size={22} color={C.mutedIcon} />
          </IconButton>
        </View>
      </View>

      <View style={styles.middle} onLayout={(e) => setMiddleH(Math.round(e.nativeEvent.layout.height))}>
        <OrbSlot
          scale={orbScale}
          orb={<Orb listening={recording} onPress={() => void talk()} cheer={cheer} size={ORB} />}
          badge={
            <PressableScale
              onPress={() => router.push('/your-jesse' as Href)}
              hitSlop={slopFor(BADGE)}
              scaleTo={0.9}
              accessibilityRole="button"
              accessibilityLabel="Customize your Jesse"
              style={styles.customize}>
              <Icon name="pencil" size={15} color={C.onAccent} strokeWidth={2.2} />
            </PressableScale>
          }
        />
        <ScrollView
          style={styles.exchangeScroll}
          contentContainerStyle={styles.exchange}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityLiveRegion="polite">
          {exchange ? (
            <Animated.Text
              key={`you:${exchange.you}`}
              entering={fadeIn}
              layout={layout}
              style={styles.you}
              numberOfLines={2}>
              {exchange.you}
            </Animated.Text>
          ) : null}
          {thinking && exchange && exchange.jesse === null ? (
            <ThinkingDots />
          ) : reply ? (
            <Animated.Text
              key={reply}
              entering={enter(1)}
              exiting={fadeOut}
              layout={layout}
              style={[styles.reply, reply.split(/\s+/).length > 28 && styles.replyLong]}>
              {reply}
            </Animated.Text>
          ) : null}
        </ScrollView>
      </View>

      <View style={styles.bottom}>
        {note ? (
          <Animated.Text entering={fadeIn} exiting={fadeOut} layout={layout} style={styles.note}>
            {note}
          </Animated.Text>
        ) : null}
        {typing ? (
          <Animated.View entering={enter(0)} exiting={fadeOut} layout={layout} style={styles.inputWrap}>
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
          </Animated.View>
        ) : null}
        {compact ? null : (
          <Animated.View entering={fadeIn} exiting={fadeOut} layout={layout} style={styles.talk}>
            <Text style={[styles.phase, (recording || thinking) && { color: C.accentDeep }]}>
              {recording ? 'Listening… tap to send' : thinking ? 'Thinking…' : 'Tap to talk'}
            </Text>
            <PressableScale
              onPress={() => void talk()}
              disabled={thinking}
              accessibilityRole="button"
              accessibilityLabel={recording ? 'Send to Jesse' : 'Talk to Jesse'}
              accessibilityState={{ busy: thinking, selected: recording }}
              style={[styles.mic, recording && styles.micLive, thinking && styles.micBusy]}>
              <Animated.View key={recording ? 'stop' : 'mic'} entering={fadeIn}>
                {recording ? (
                  <View style={styles.stop} />
                ) : (
                  <Icon name="mic" size={34} color={C.onAccent} strokeWidth={2.2} />
                )}
              </Animated.View>
            </PressableScale>
          </Animated.View>
        )}
        <Animated.View layout={layout}>
          <PressableScale onPress={() => setTyping((t) => !t)} accessibilityRole="button" style={styles.linkHit}>
            <Text style={styles.link}>{typing ? 'Hide keyboard' : 'Type'}</Text>
          </PressableScale>
        </Animated.View>
        <Animated.View layout={layout} style={styles.footer}>
          {captureOn ? (
            <PressableScale
              onPress={() => capture.setPaused(!capturePaused)}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={capturePaused ? 'Resume background listening' : 'Pause background listening'}
              style={styles.capture}>
              <Text style={styles.status} numberOfLines={1}>
                {capturePaused ? 'Background listening paused · ' : 'Listening in the background · '}
                <Text style={styles.captureAction}>{capturePaused ? 'Resume' : 'Pause'}</Text>
              </Text>
            </PressableScale>
          ) : (
            <View style={styles.capture} />
          )}
          <PressableScale onPress={() => router.push('/walk' as Href)} accessibilityRole="link" style={styles.walkHit}>
            <Text style={styles.walk}>Walk home</Text>
          </PressableScale>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The tab bar sits right below; the default 32pt bottom padding wastes space on short screens.
  screen: { paddingBottom: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: { flexShrink: 1, fontFamily: F.medium, fontSize: 13, color: C.muted },
  voiceHit: {
    minHeight: S.touch,
    minWidth: S.touch,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voice: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  middle: { flex: 1, alignItems: 'center' },
  orbSlot: { alignItems: 'center', justifyContent: 'center' },
  badgeAnchor: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customize: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: C.bg,
  },
  exchangeScroll: { flex: 1, alignSelf: 'stretch' },
  exchange: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  you: {
    fontFamily: F.regular,
    fontSize: 14,
    lineHeight: 20,
    color: C.muted,
    textAlign: 'center',
  },
  reply: {
    fontFamily: F.display,
    fontSize: 22,
    lineHeight: 30,
    color: C.ink,
    textAlign: 'center',
  },
  replyLong: { fontSize: 19, lineHeight: 26 },
  dots: { flexDirection: 'row', gap: 8, height: 30, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  bottom: { alignItems: 'center', gap: 12 },
  note: {
    fontFamily: F.regular,
    fontSize: 13,
    color: C.amberText,
    textAlign: 'center',
  },
  inputWrap: { alignSelf: 'stretch' },
  input: {
    minHeight: S.touch,
    fontFamily: F.regular,
    fontSize: 15,
    color: C.ink,
    backgroundColor: C.surface,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  talk: { alignItems: 'center', gap: 12 },
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
  linkHit: {
    minHeight: S.touch,
    paddingHorizontal: 12,
    marginVertical: -12,
    justifyContent: 'center',
  },
  link: { fontFamily: F.semibold, fontSize: 14, color: C.accent },
  footer: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: S.touch,
  },
  capture: { flex: 1, justifyContent: 'center' },
  status: { fontFamily: F.regular, fontSize: 12, color: C.muted },
  captureAction: { fontFamily: F.semibold, color: C.inkSoft },
  walkHit: {
    minWidth: S.touch,
    paddingLeft: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  walk: { fontFamily: F.semibold, fontSize: 12, color: C.accent },
});
