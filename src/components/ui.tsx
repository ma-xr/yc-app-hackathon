import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import type { HapticKind } from '@/theme/motion';
import { avatarColors, C, F, S, shadow, T } from '@/theme/tokens';

export function Screen({
  children,
  scroll = true,
  edges = ['top'],
  keyboard = false,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  keyboard?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const bottom = edges.includes('bottom') ? insets.bottom : 0;
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingBottom: 32 + bottom }, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentInsetAdjustmentBehavior="never">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.scroll, { flex: 1, paddingBottom: bottom ? bottom + 12 : 32 }, contentStyle]}>{children}</View>
  );
  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: edges.includes('top') ? insets.top : 0,
          paddingLeft: edges.includes('left') ? insets.left : 0,
          paddingRight: edges.includes('right') ? insets.right : 0,
        },
      ]}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={T.h1}>
      {children}
    </Text>
  );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text accessibilityRole="header" style={[T.label, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Avatar({ name, size = 40, dashed }: { name: string; size?: number; dashed?: boolean }) {
  const { bg, fg } = dashed ? { bg: C.amberTint, fg: C.amberText } : avatarColors(name);
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: dashed ? 2 : 0,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: C.amberDot,
      }}>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.4, color: fg }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export type Tone = 'accent' | 'amber' | 'green' | 'neutral';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: C.accentTint, fg: C.accentDeep },
  amber: { bg: C.amberTint, fg: C.amberText },
  green: { bg: C.greenTint, fg: C.greenText },
  neutral: { bg: C.neutralChip, fg: C.ink },
};

export function Chip({ children, tone = 'accent' }: { children: ReactNode; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      <Text style={[T.chip, { color: t.fg }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

type ButtonVariant = 'primary' | 'outline' | 'dark' | 'ghost' | 'outlineLight';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  accessibilityLabel,
  compact,
  disabled,
  haptic,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  accessibilityLabel?: string;
  compact?: boolean;
  disabled?: boolean;
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANTS[variant];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      disabled={disabled}
      haptic={haptic ?? (variant === 'primary' || variant === 'dark' ? 'light' : false)}
      hitSlop={compact ? 4 : 0}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: v.bg, borderColor: v.border },
        disabled && styles.buttonDisabled,
        style,
      ]}>
      {icon ? <Icon name={icon} size={16} color={v.fg} strokeWidth={2} /> : null}
      <Text style={[styles.buttonText, { color: v.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: C.accent, fg: C.onAccent, border: C.accent },
  outline: { bg: C.surface, fg: C.ink, border: C.chipBorder },
  dark: { bg: C.night, fg: C.onNight, border: C.night },
  ghost: { bg: 'transparent', fg: C.accent, border: 'transparent' },
  outlineLight: { bg: 'transparent', fg: C.onNight, border: 'rgba(255,255,255,0.35)' },
};

export function Divider() {
  return <View style={styles.divider} />;
}

export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={[T.bodySmall, { color: C.muted, textAlign: 'center' }]}>{children}</Text>
    </View>
  );
}

export function JesseNoteTag() {
  return (
    <View style={styles.noteTag} accessibilityLabel="Jesse's note">
      <Icon name="sparkle" size={12} color={C.accent} strokeWidth={2} />
      <Text style={[T.chip, { color: C.accentDeep, fontSize: 11 }]}>Jesse’s note</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: S.screenX, paddingTop: S.screenTop, paddingBottom: 32, gap: S.gap },
  card: { backgroundColor: C.surface, borderRadius: S.cardRadius, padding: 16, ...shadow },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  button: {
    minHeight: S.touch,
    paddingHorizontal: 16,
    borderRadius: S.buttonRadius,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  buttonCompact: { minHeight: 36, paddingHorizontal: 12, borderRadius: 12 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontFamily: F.bold, fontSize: 14 },
  divider: { height: 1, backgroundColor: C.divider },
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.chipBorder,
    borderRadius: S.cardRadius,
    padding: 20,
  },
  noteTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
