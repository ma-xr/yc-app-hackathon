import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { C, ORB_STOPS } from '@/theme/tokens';

export function OrbArt({ size, id = 'orb' }: { size: number; id?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={id} cx="34%" cy="28%" r="75%" fx="34%" fy="28%">
          {ORB_STOPS.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
    </Svg>
  );
}

function Sheen({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="sheenA" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.32" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="sheenB" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFB8E6" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#FFB8E6" stopOpacity="0.3" />
          <Stop offset="1" stopColor="#FFB8E6" stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id="highlight" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.85" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="50" cy="28" rx="44" ry="16" fill="url(#sheenA)" />
      <Ellipse cx="62" cy="74" rx="34" ry="12" fill="url(#sheenB)" />
      <Ellipse cx="30" cy="26" rx="18" ry="13" fill="url(#highlight)" />
    </Svg>
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

export function Orb({
  listening,
  onPress,
  onLongPress,
  onPressOut,
  size = 180,
}: {
  listening: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  size?: number;
}) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(0);
  const spin = useSharedValue(0);
  const halo = useSharedValue(0);
  const r1 = useSharedValue(0);
  const r2 = useSharedValue(0);

  useEffect(() => {
    [breathe, spin, halo, r1, r2].forEach((v) => {
      cancelAnimation(v);
      v.value = 0;
    });
    if (reduceMotion) return;
    const breatheMs = listening ? 1600 : 5000;
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: breatheMs / 2, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: breatheMs / 2, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    spin.value = withRepeat(
      withTiming(1, { duration: listening ? 3000 : 12000, easing: Easing.linear }),
      -1,
    );
    halo.value = withRepeat(
      withSequence(withTiming(1, { duration: 2500 }), withTiming(0, { duration: 2500 })),
      -1,
    );
    if (listening) {
      r1.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1);
      r2.value = withDelay(
        1200,
        withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1),
      );
    }
  }, [listening, reduceMotion, breathe, spin, halo, r1, r2]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.05 * breathe.value }] }));
  const sheenStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.6 + 0.4 * halo.value }));
  const haloSize = size + 60;

  return (
    <View style={{ width: haloSize + 40, height: haloSize + 40, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, haloStyle]}>
        <Svg width={haloSize} height={haloSize}>
          <Defs>
            <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="rgb(123,108,240)" stopOpacity="0.28" />
              <Stop offset="1" stopColor="rgb(123,108,240)" stopOpacity="0" />
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
      <Animated.View style={orbStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop listening' : 'Start listening'}
          accessibilityHint={listening ? undefined : 'Hold to ask Jesse a question'}
          accessibilityState={{ selected: listening }}
          onPress={onPress}
          onLongPress={onLongPress}
          onPressOut={onPressOut}
          style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}>
          <OrbArt size={size} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheenStyle]}>
            <Sheen size={size} />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  orb: {
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 28px 60px rgba(90,72,214,0.38)' },
      default: {
        shadowColor: C.accent,
        shadowOpacity: 0.38,
        shadowRadius: 30,
        shadowOffset: { width: 0, height: 28 },
        elevation: 12,
      },
    }),
  },
  ringAnchor: { position: 'absolute', left: '50%', top: '50%' },
  ring: { position: 'absolute', borderWidth: 2, borderColor: C.accent },
});
