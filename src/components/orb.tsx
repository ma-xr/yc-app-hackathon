import { useEffect, useRef, useState } from 'react';
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
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useIsSpeaking } from '@/lib/voice';
import { C, ORB_STOPS } from '@/theme/tokens';

const POSES = {
  idle: require('../../assets/jesse/idle.png'),
  blink: require('../../assets/jesse/blink.png'),
  talk: require('../../assets/jesse/talk.png'),
  happy: require('../../assets/jesse/happy.png'),
};

type Pose = keyof typeof POSES;

export function OrbArt({ size, pose = 'idle' }: { size: number; id?: string; pose?: Pose }) {
  return <Image source={POSES[pose]} style={{ width: size, height: size }} resizeMode="contain" />;
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
}: {
  listening: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  cheer?: unknown;
  size?: number;
}) {
  const reduceMotion = useReducedMotion();
  const { pose, speaking, happy } = usePose(listening, cheer, reduceMotion);
  const breathe = useSharedValue(0);
  const sway = useSharedValue(0);
  const hop = useSharedValue(0);
  const halo = useSharedValue(0);
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);

  useEffect(() => {
    [breathe, sway, halo, r1, r2].forEach((v) => {
      cancelAnimation(v);
      v.value = 0;
    });
    if (reduceMotion) return;
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
      { translateY: -6 * breathe.value - 18 * hop.value + (listening ? 6 : 0) },
      { rotate: `${(listening ? 5 : 2) * sway.value}deg` },
      { scale: 1 + 0.03 * breathe.value + (listening ? 0.04 : 0) },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.6 + 0.4 * halo.value }));
  const haloSize = size + 60;

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
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={ORB_STOPS[2].color} stopOpacity="0.32" />
              <Stop offset="1" stopColor={ORB_STOPS[2].color} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={haloSize / 2} cy={haloSize / 2} r={haloSize / 2} fill="url(#halo)" />
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
          <OrbArt size={size} pose={pose} />
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
