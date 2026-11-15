import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { OrbArt } from '@/components/orb';
import { C, F } from '@/theme/tokens';

const TABS: { name: string; href: '/' | '/plans' | '/people' | '/ideas'; label: string; icon?: IconName }[] = [
  { name: 'index', href: '/', label: 'Home' },
  { name: 'plans', href: '/plans', label: 'Plans', icon: 'calendar' },
  { name: 'people', href: '/people', label: 'People', icon: 'users' },
  { name: 'ideas', href: '/ideas', label: 'Ideas', icon: 'lightbulb' },
];

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={{ flex: 1, backgroundColor: C.bg }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={StyleSheet.flatten([styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }])}>
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton label={t.label}>
              {t.icon ? null : <OrbArt size={24} id="tabOrb" />}
            </TabButton>
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

function TabButton({
  label,
  children,
  isFocused,
  ref: _ref,
  ...props
}: TabTriggerSlotProps & { label: string; children?: ReactNode }) {
  const tab = TABS.find((t) => t.label === label)!;
  const color = isFocused ? C.accent : C.mutedIcon;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={styles.tab}>
      <View style={[styles.pill, isFocused && { backgroundColor: C.accentTint }]}>
        {tab.icon ? <Icon name={tab.icon} color={color} /> : children}
      </View>
      <Text style={[styles.label, { color, fontFamily: isFocused ? F.bold : F.medium }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
    minHeight: 84,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 44 },
  pill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11 },
});
