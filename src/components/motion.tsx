import { useEffect, type ReactNode } from 'react';
import { type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { enter, fadeOut, layout } from '@/theme/motion';
import { C, S } from '@/theme/tokens';

export function Enter({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={enter(index)} exiting={fadeOut} layout={layout} style={style}>
      {children}
    </Animated.View>
  );
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.35 }));
  return (
    <Animated.View
      accessible={false}
      style={[{ width, height, borderRadius: radius, backgroundColor: C.neutralChip }, animated, style]}
    />
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={{ backgroundColor: C.surface, borderRadius: S.cardRadius, padding: 16, gap: 10 }}>
      <Skeleton width="45%" height={14} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={12} />
      ))}
    </Animated.View>
  );
}
