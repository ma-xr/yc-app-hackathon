import { useEffect, useId, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { ART, GLOWS, useLook, type Expression, type Look, type Pose } from '@/lib/jesse-look';
import { useIsSpeaking } from '@/lib/voice';
import { SPRING } from '@/theme/motion';
import { C } from '@/theme/tokens';

const REST: Record<Expression, Pose> = { calm: 'idle', happy: 'happy', sleepy: 'blink' };

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function Accessory({ look, size }: { look: Look; size: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const c = look.accent;
  const light = shade(c, 0.35);
  const dark = shade(c, -0.3);
  const sleepy = look.expression === 'sleepy';
  if (look.accessory === 'none' && !sleepy) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={`acc${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={light} />
          <Stop offset="1" stopColor={dark} />
        </LinearGradient>
        <RadialGradient id={`cup${uid}`} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor={light} />
          <Stop offset="1" stopColor={dark} />
        </RadialGradient>
      </Defs>
      {look.accessory === 'scarf' ? (
        <G>
          <Path d="M21 50 C 34 57, 66 57, 79 50 L 80 57 C 66 64, 34 64, 20 57 Z" fill={`url(#acc${uid})`} />
          <Path d="M24 52.5 C 36 58.5, 64 58.5, 76 52.5" stroke={light} strokeWidth={0.8} strokeOpacity={0.7} fill="none" />
          <Path d="M62 58 C 61 64, 61 70, 63 75 L 70 74 C 69 69, 69 63, 70 57 Z" fill={`url(#acc${uid})`} />
          <Path d="M63 75 L 64.5 78 M66 74.6 L 67 77.6 M69 74.2 L 69.6 77.2" stroke={dark} strokeWidth={1} strokeLinecap="round" />
          <Path d="M64.5 66 L 69.2 65.4" stroke={light} strokeWidth={1.2} strokeLinecap="round" strokeOpacity={0.8} />
        </G>
      ) : null}
      {look.accessory === 'beanie' ? (
        <G>
          <Path d="M24 29 C 23 8, 77 8, 76 29 Z" fill={`url(#acc${uid})`} />
          {[30, 37, 44, 51, 58, 65, 72].map((x) => (
            <Path key={x} d={`M${x} 27 C ${x} 20, ${x + (x - 50) * 0.15} 15, ${50 + (x - 50) * 0.55} 13`} stroke={dark} strokeOpacity={0.35} strokeWidth={0.9} fill="none" />
          ))}
          <Rect x={21.5} y={25} width={57} height={8} rx={4} fill={dark} />
          <Rect x={21.5} y={25} width={57} height={4} rx={2} fill={c} />
          <Circle cx={50} cy={8.5} r={5} fill={`url(#cup${uid})`} />
        </G>
      ) : null}
      {look.accessory === 'headphones' ? (
        <G>
          <Path d="M21 36 C 19 5, 81 5, 79 36" stroke={dark} strokeWidth={4.2} fill="none" strokeLinecap="round" />
          <Path d="M21 36 C 19 5, 81 5, 79 36" stroke={light} strokeWidth={1.6} strokeOpacity={0.6} fill="none" strokeLinecap="round" />
          <Rect x={14.5} y={29} width={10} height={16} rx={5} fill={`url(#cup${uid})`} />
          <Rect x={75.5} y={29} width={10} height={16} rx={5} fill={`url(#cup${uid})`} />
          <Rect x={22.5} y={31.5} width={3} height={11} rx={1.5} fill={dark} />
          <Rect x={74.5} y={31.5} width={3} height={11} rx={1.5} fill={dark} />
        </G>
      ) : null}
      {look.accessory === 'flower' ? (
        <G>
          {[0, 72, 144, 216, 288].map((deg) => {
            const r = (deg * Math.PI) / 180;
            return <Circle key={deg} cx={70 + 4.2 * Math.cos(r)} cy={23 + 4.2 * Math.sin(r)} r={3.6} fill={`url(#cup${uid})`} />;
          })}
          <Circle cx={70} cy={23} r={2.4} fill="#F7D774" />
          <Circle cx={69.3} cy={22.3} r={0.9} fill="#FFF4C2" />
          <Path d="M64 27 C 62 28.5, 61 30, 61.5 32 C 63.5 31.5, 64.8 30, 65 28 Z" fill="#7FA66A" />
        </G>
      ) : null}
      {sleepy ? (
        <G>
          <SvgText x={76} y={20} fontSize={7} fontWeight="700" fill={C.inkSoft} opacity={0.85}>
            z
          </SvgText>
          <SvgText x={81} y={13} fontSize={5} fontWeight="700" fill={C.inkSoft} opacity={0.6}>
            z
          </SvgText>
        </G>
      ) : null}
    </Svg>
  );
}

export function OrbArt({ size, pose = 'idle', look: override }: { size: number; id?: string; pose?: Pose; look?: Look }) {
  const saved = useLook();
  const look = override ?? saved;
  const art = ART[look.fur];
  const shown = pose === 'idle' ? REST[look.expression] : pose;
  const source = size <= 64 && shown === 'idle' ? art.icon : art[shown];
  return (
    <View style={{ width: size, height: size }}>
      <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
      <Accessory look={look} size={size} />
    </View>
  );
}

function Ripple({ progress, size }: { progress: SharedValue<number>; size: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: 0.85 + 0.6 * progress.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2 },
        style,
      ]}
    />
  );
}

function usePose(listening: boolean, cheer: unknown, reduceMotion: boolean) {
  const speaking = useIsSpeaking();
  const [blink, setBlink] = useState(false);
  const [mouth, setMouth] = useState(false);
  const [happy, setHappy] = useState(false);
  const firstCheer = useRef(true);

  useEffect(() => {
    if (reduceMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true);
        timer = setTimeout(() => {
          setBlink(false);
          schedule();
        }, 140);
      }, 2600 + Math.random() * 2600);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    if (!speaking) return;
    const timer = setInterval(() => setMouth((m) => !m), 190);
    return () => clearInterval(timer);
  }, [speaking]);

  useEffect(() => {
    if (firstCheer.current) {
      firstCheer.current = false;
      return;
    }
    setHappy(true);
    const timer = setTimeout(() => setHappy(false), 1400);
    return () => clearTimeout(timer);
  }, [cheer]);

  const pose: Pose = happy ? 'happy' : speaking ? (mouth ? 'talk' : 'idle') : blink && !listening ? 'blink' : 'idle';
  return { pose, speaking, cheerNow: () => setHappy(true), happy };
}

export function Orb({
  listening,
  onPress,
  onLongPress,
  onPressOut,
  cheer,
  size = 180,
  look,
}: {
  listening: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  cheer?: unknown;
  size?: number;
  look?: Look;
}) {
  const reduceMotion = useReducedMotion();
  const { pose, speaking, happy } = usePose(listening, cheer, reduceMotion);
  const breathe = useSharedValue(0);
  const sway = useSharedValue(0);
  const hop = useSharedValue(0);
  const halo = useSharedValue(0);
  const live = useSharedValue(listening ? 1 : 0);
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);

  useEffect(() => {
    live.value = reduceMotion ? (listening ? 1 : 0) : withSpring(listening ? 1 : 0, SPRING.gentle);
  }, [listening, reduceMotion, live]);

  useEffect(() => {
    [breathe, sway, halo, r1, r2].forEach((v) => cancelAnimation(v));
    r1.value = 0;
    r2.value = 0;
    if (reduceMotion) {
      breathe.value = 0;
      sway.value = 0;
      halo.value = 0;
      return;
    }
    const breatheMs = listening ? 1400 : speaking ? 900 : 4200;
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: breatheMs / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: breatheMs / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    sway.value = withRepeat(
      withSequence(
        withTiming(1, { duration: listening ? 900 : 3200, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: listening ? 900 : 3200, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    halo.value = withRepeat(withSequence(withTiming(1, { duration: 2500 }), withTiming(0, { duration: 2500 })), -1);
    if (listening) {
      r1.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1);
      r2.value = withDelay(1200, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1));
    }
  }, [listening, speaking, reduceMotion, breathe, sway, halo, r1, r2]);

  useEffect(() => {
    if (!happy || reduceMotion) return;
    hop.value = withSequence(withTiming(1, { duration: 160 }), withSpring(0, { damping: 6, stiffness: 180 }));
  }, [happy, reduceMotion, hop]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -6 * breathe.value - 18 * hop.value + 6 * live.value },
      { rotate: `${(2 + 3 * live.value) * sway.value}deg` },
      { scale: 1 + 0.03 * breathe.value + 0.04 * live.value },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.6 + 0.4 * halo.value }));
  const haloSize = size + 60;
  const saved = useLook();
  const glow = GLOWS[(look ?? saved).glow].color;
  const haloId = useId().replace(/[^a-zA-Z0-9]/g, '');

  const tap = () => {
    if (!reduceMotion) {
      hop.set(withSequence(withTiming(0.6, { duration: 120 }), withSpring(0, { damping: 5, stiffness: 200 })));
    }
    onPress();
  };

  return (
    <View style={{ width: haloSize + 40, height: haloSize + 40, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, haloStyle]}>
        <Svg width={haloSize} height={haloSize}>
          <Defs>
            <RadialGradient id={`halo${haloId}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={glow} stopOpacity={glow === 'transparent' ? 0 : 0.38} />
              <Stop offset="1" stopColor={glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize / 2} fill={`url(#halo${haloId})`} />
        </Svg>
      </Animated.View>
      {listening ? (
        <View pointerEvents="none" style={styles.ringAnchor}>
          <Ripple progress={r1} size={size} />
          <Ripple progress={r2} size={size} />
        </View>
      ) : null}
      <Animated.View style={bodyStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop listening' : 'Start listening'}
          accessibilityHint={listening ? undefined : 'Hold to ask Jesse a question'}
          accessibilityState={{ selected: listening }}
          onPress={tap}
          onLongPress={onLongPress}
          onPressOut={onPressOut}
          style={{ width: size, height: size }}>
          <OrbArt size={size} pose={pose} look={look} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  ringAnchor: { position: 'absolute', left: '50%', top: '50%' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: C.accent },
});
