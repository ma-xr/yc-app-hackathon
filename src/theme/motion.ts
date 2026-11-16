import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  type WithSpringConfig,
} from 'react-native-reanimated';

export const SPRING = {
  press: { damping: 18, stiffness: 420, mass: 0.6 },
  snappy: { damping: 20, stiffness: 260, mass: 0.8 },
  gentle: { damping: 22, stiffness: 160, mass: 1 },
  bouncy: { damping: 12, stiffness: 220, mass: 0.9 },
} satisfies Record<string, WithSpringConfig>;

export const PRESS_SCALE = 0.96;
export const STAGGER_MS = 45;
export const MAX_STAGGER = 8;

// On web, reanimated's entering animations hide an element (visibility:hidden) until a CSS
// animation starts, and custom presets get pinned with position:absolute when they end. Both
// break the public web demo (invisible text, overlaps), so web renders content without them.
const WEB = Platform.OS === 'web';

export const enter = (index = 0) => (WEB ? undefined : enterNative(index));

const enterNative = (index: number) =>
  FadeInDown.springify()
    .damping(SPRING.gentle.damping)
    .stiffness(SPRING.gentle.stiffness)
    .mass(SPRING.gentle.mass)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 12 }] })
    .delay(Math.min(index, MAX_STAGGER) * STAGGER_MS)
    .reduceMotion(ReduceMotion.System);

export const fadeIn = WEB ? undefined : FadeIn.duration(220).reduceMotion(ReduceMotion.System);
export const fadeOut = WEB ? undefined : FadeOut.duration(160).reduceMotion(ReduceMotion.System);

export const layout =
  Platform.OS === 'web'
    ? undefined
    : LinearTransition.springify()
        .damping(SPRING.snappy.damping)
        .stiffness(SPRING.snappy.stiffness)
        .mass(SPRING.snappy.mass)
        .reduceMotion(ReduceMotion.System);

export type HapticKind = 'light' | 'medium' | 'selection' | 'success';

export function haptic(kind: HapticKind = 'light') {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'selection'
      ? Haptics.selectionAsync()
      : kind === 'success'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
  void run.catch(() => {});
}
