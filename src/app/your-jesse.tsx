import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Orb, OrbArt } from "@/components/orb";
import { Button, Screen } from "@/components/ui";
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
} from "@/lib/jesse-look";
import { C, F, S, T } from "@/theme/tokens";

const keys = <O extends object>(o: O) => Object.keys(o) as (keyof O)[];
const pick = <V,>(list: readonly V[]) =>
  list[Math.floor(Math.random() * list.length)];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={T.label}>{title}</Text>
      <View style={styles.row}>{children}</View>
    </View>
  );
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={styles.swatchWrap}
    >
      <View style={[styles.swatchRing, selected && { borderColor: C.ink }]}>
        <View
          style={[
            styles.swatch,
            color === "transparent"
              ? {
                  backgroundColor: C.surface,
                  borderWidth: 1,
                  borderColor: C.chipBorder,
                  borderStyle: "dashed",
                }
              : { backgroundColor: color },
          ]}
        />
      </View>
      <Text
        style={[
          styles.swatchLabel,
          selected && { color: C.ink, fontFamily: F.semibold },
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.tile, selected && styles.tileOn]}
    >
      <OrbArt size={52} look={look} />
      <Text style={[styles.tileLabel, selected && { color: C.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function YourJesse() {
  const look = useLook();
  const [hop, setHop] = useState(0);
  const set = (patch: Partial<Look>) => {
    saveLook({ ...look, ...patch });
    setHop((n) => n + 1);
  };

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <Text style={T.h1} accessibilityRole="header">
          Your Jesse
        </Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
        >
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <Text style={[T.body, { color: C.muted, marginTop: -6 }]}>
        Make Jesse yours. It walks home with you every night.
      </Text>

      <View style={styles.preview}>
        <Orb
          listening={false}
          onPress={() => setHop((n) => n + 1)}
          cheer={hop}
          size={170}
          look={look}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.options}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Fur">
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

        <Section title="Wearing">
          {keys(ACCESSORIES).map((accessory: Accessory) => (
            <Tile
              key={accessory}
              look={{ ...look, accessory, expression: "calm" }}
              label={ACCESSORIES[accessory]}
              selected={look.accessory === accessory}
              onPress={() => set({ accessory })}
            />
          ))}
        </Section>

        {look.accessory !== "none" ? (
          <Section title={`${ACCESSORIES[look.accessory]} colour`}>
            {ACCENTS.map((accent, i) => (
              <Swatch
                key={accent}
                color={accent}
                label={["Berry", "Denim", "Mustard", "Moss", "Cream"][i]}
                selected={look.accent === accent}
                onPress={() => set({ accent })}
              />
            ))}
          </Section>
        ) : null}

        <Section title="Mood">
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

        <Section title="Glow">
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  done: { fontFamily: F.bold, fontSize: 16, color: C.accent },
  preview: { alignItems: "center", marginVertical: -26 },
  options: { gap: S.gap, paddingBottom: 40 },
  section: { gap: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatchWrap: { alignItems: "center", gap: 4, width: 50 },
  swatchRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchLabel: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  tile: {
    alignItems: "center",
    gap: 2,
    width: 63,
    paddingVertical: 8,
    borderRadius: S.cardRadius - 8,
    backgroundColor: C.surface,
    borderWidth: 2,
    borderColor: "transparent",
  },
  tileOn: { borderColor: C.accent },
  tileLabel: { fontFamily: F.semibold, fontSize: 11, color: C.muted },
});
