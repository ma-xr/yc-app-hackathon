import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type Insets, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic, PRESS_SCALE, SPRING, type HapticKind } from '@/theme/motion';
import { S } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: HapticKind | false;
};

export function PressableScale({
  children,
  style,
  scaleTo = PRESS_SCALE,
  haptic: kind = false,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const pressed = useSharedValue(0);
  const baseOpacity = StyleSheet.flatten(style)?.opacity ?? 1;
  const animated = useAnimatedStyle(() => ({
    opacity: baseOpacity * (reduced ? 1 - pressed.value * 0.25 : 1),
    transform: [{ scale: reduced ? 1 : 1 - pressed.value * (1 - scaleTo) }],
  }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
      onPressIn={(e) => {
        pressed.value = withSpring(1, SPRING.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(0, SPRING.press);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (kind) haptic(kind);
        onPress?.(e);
      }}
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}

export function slopFor(width: number, height = width): Insets {
  const x = Math.max(0, Math.ceil((S.touch - width) / 2));
  const y = Math.max(0, Math.ceil((S.touch - height) / 2));
  return { top: y, bottom: y, left: x, right: x };
}

export function IconButton({
  children,
  accessibilityLabel,
  size = S.touch,
  style,
  ...rest
}: PressableScaleProps & { accessibilityLabel: string; size?: number }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={slopFor(size)}
      scaleTo={0.9}
      {...rest}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }, style]}>
      {children}
    </PressableScale>
  );
}
