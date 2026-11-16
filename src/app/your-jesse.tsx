import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { Orb, OrbArt } from '@/components/orb';
import { PressableScale } from '@/components/pressable-scale';
import { Button, Screen } from '@/components/ui';
import {
  ACCENTS,
  ACCESSORIES,
  EXPRESSIONS,
  FURS,
  GLOWS,
  saveLook,
  useLook,
  type Accessory,
  type Expression,
  type Fur,
  type Glow,
  type Look,
} from '@/lib/jesse-look';
import { enter, fadeOut, layout, SPRING } from '@/theme/motion';
import { C, F, S, T } from '@/theme/tokens';

const keys = <O extends object>(o: O) => Object.keys(o) as (keyof O)[];
const pick = <V,>(list: readonly V[]) => list[Math.floor(Math.random() * list.length)];

function Section({ title, index, children }: { title: string; index: number; children: ReactNode }) {
  return (
    <Animated.View entering={enter(index)} exiting={fadeOut} layout={layout} style={styles.section}>
      <Text style={T.label}>{title}</Text>
      <View style={styles.row}>{children}</View>
    </Animated.View>
  );
}

function useSelected(selected: boolean): SharedValue<number> {
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(selected ? 1 : 0, SPRING.bouncy);
  }, [on, selected]);
  return on;
}

function Swatch({
  color,
  label,
  selected,
  onPress,
}: {
  color: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const on = useSelected(selected);
  const ring = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ scale: 0.82 + 0.18 * on.value }],
  }));
  const dot = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + 0.06 * on.value }],
  }));
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      scaleTo={0.9}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={styles.swatchWrap}>
      <View style={styles.swatchRing}>
        <Animated.View pointerEvents="none" style={[styles.ringOn, ring]} />
        <Animated.View
          style={[
            styles.swatch,
            color === 'transparent'
              ? {
                  backgroundColor: C.surface,
                  borderWidth: 1,
                  borderColor: C.muted,
                  borderStyle: 'dashed',
                }
              : { backgroundColor: color },
            dot,
          ]}
        />
      </View>
      <Text style={[styles.swatchLabel, selected && { color: C.ink, fontFamily: F.semibold }]}>{label}</Text>
    </PressableScale>
  );
}

function Tile({
  look,
  label,
  selected,
  onPress,
}: {
  look: Look;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const on = useSelected(selected);
  const border = useAnimatedStyle(() => ({ opacity: on.value }));
  const art = useAnimatedStyle(() => ({
    transform: [{ scale: 0.94 + 0.06 * on.value }],
  }));
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={styles.tile}>
      <Animated.View pointerEvents="none" style={[styles.tileOn, border]} />
      <Animated.View style={art}>
        <OrbArt size={52} look={look} />
      </Animated.View>
      <Text style={[styles.tileLabel, selected && { color: C.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

export default function YourJesse() {
  const look = useLook();
  const [hop, setHop] = useState(0);
  // On short screens (and the web demo frame) a smaller preview leaves room for the options.
  const { height } = useWindowDimensions();
  const previewSize = height < 800 ? 130 : 170;
  const set = (patch: Partial<Look>) => {
    saveLook({ ...look, ...patch });
    setHop((n) => n + 1);
  };

  return (
    <Screen scroll={false} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={T.h1} accessibilityRole="header">
          Your Jesse
        </Text>
        <PressableScale onPress={() => router.back()} accessibilityRole="button" style={styles.doneHit}>
          <Text style={styles.done}>Done</Text>
        </PressableScale>
      </View>
      <Text style={[T.body, { color: C.muted, marginTop: -6 }]}>
        Make Jesse yours. It walks home with you every night.
      </Text>

      <View style={styles.preview}>
        <Orb listening={false} onPress={() => setHop((n) => n + 1)} cheer={hop} size={previewSize} look={look} />
      </View>
      <ScrollView contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
        <Section title="Fur" index={0}>
          {keys(FURS).map((fur: Fur) => (
            <Swatch
              key={fur}
              color={FURS[fur].swatch}
              label={FURS[fur].label}
              selected={look.fur === fur}
              onPress={() => set({ fur })}
            />
          ))}
        </Section>

        <Section title="Wearing" index={1}>
          {keys(ACCESSORIES).map((accessory: Accessory) => (
            <Tile
              key={accessory}
              look={{ ...look, accessory, expression: 'calm' }}
              label={ACCESSORIES[accessory]}
              selected={look.accessory === accessory}
              onPress={() => set({ accessory })}
            />
          ))}
        </Section>

        {look.accessory !== 'none' ? (
          <Section title={`${ACCESSORIES[look.accessory]} colour`} index={2}>
            {ACCENTS.map((accent, i) => (
              <Swatch
                key={accent}
                color={accent}
                label={['Berry', 'Denim', 'Mustard', 'Moss', 'Cream'][i]}
                selected={look.accent === accent}
                onPress={() => set({ accent })}
              />
            ))}
          </Section>
        ) : null}

        <Section title="Mood" index={3}>
          {keys(EXPRESSIONS).map((expression: Expression) => (
            <Tile
              key={expression}
              look={{ ...look, expression }}
              label={EXPRESSIONS[expression]}
              selected={look.expression === expression}
              onPress={() => set({ expression })}
            />
          ))}
        </Section>

        <Section title="Glow" index={4}>
          {keys(GLOWS).map((glow: Glow) => (
            <Swatch
              key={glow}
              color={GLOWS[glow].color}
              label={GLOWS[glow].label}
              selected={look.glow === glow}
              onPress={() => set({ glow })}
            />
          ))}
        </Section>

        <Button
          label="Surprise me"
          variant="outline"
          icon="sparkle"
          onPress={() =>
            set({
              fur: pick(keys(FURS)),
              accessory: pick(keys(ACCESSORIES)),
              accent: pick(ACCENTS),
              expression: pick(keys(EXPRESSIONS)),
              glow: pick(keys(GLOWS)),
            })
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  doneHit: {
    minHeight: S.touch,
    minWidth: S.touch,
    paddingHorizontal: 8,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: { fontFamily: F.bold, fontSize: 16, color: C.accent },
  preview: { alignItems: 'center', marginVertical: -26 },
  options: { gap: S.gap, paddingBottom: 40 },
  section: { gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  // 48 wide so six swatches fit one row on a 375pt phone.
  swatchWrap: { alignItems: 'center', gap: 4, width: 48, minHeight: S.touch },
  swatchRing: { padding: 5 },
  ringOn: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: C.ink,
  },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchLabel: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  tile: {
    alignItems: 'center',
    gap: 2,
    // Five tiles fit one row on a 375pt phone and in the 430pt web frame.
    flexGrow: 1,
    flexBasis: 56,
    maxWidth: 72,
    paddingVertical: 10,
    borderRadius: S.cardRadius - 8,
    backgroundColor: C.surface,
  },
  tileOn: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: S.cardRadius - 8,
    borderWidth: 2,
    borderColor: C.accent,
  },
  tileLabel: { fontFamily: F.semibold, fontSize: 10, letterSpacing: -0.1, color: C.muted },
});
