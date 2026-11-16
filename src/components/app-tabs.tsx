import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { OrbArt } from '@/components/orb';
import { C, F } from '@/theme/tokens';

const TABS: { name: string; href: '/' | '/insights' | '/contacts'; label: string; icon?: IconName }[] = [
  { name: 'index', href: '/', label: 'Talk' },
  { name: 'insights', href: '/insights', label: 'Insights', icon: 'sparkle' },
  { name: 'contacts', href: '/contacts', label: 'Contacts', icon: 'users' },
];

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs style={{ flex: 1, backgroundColor: C.bg }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={StyleSheet.flatten([styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }])}>
        {TABS.map((t) => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton label={t.label} icon={t.icon} />
          </TabTrigger>
        ))}
      </TabList>
    </Tabs>
  );
}

function TabButton({
  label,
  icon,
  isFocused,
  ref: _ref,
  ...props
}: TabTriggerSlotProps & { label: string; icon?: IconName; children?: ReactNode }) {
  const color = isFocused ? C.accent : C.mutedIcon;
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={styles.tab}>
      <View style={[styles.icon, !isFocused && !icon && styles.dim]}>
        {icon ? <Icon name={icon} size={22} color={color} /> : <OrbArt size={26} id="tabOrb" />}
      </View>
      <Text style={[styles.label, { color, fontFamily: isFocused ? F.semibold : F.medium }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 44 },
  icon: { height: 28, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.6 },
  label: { fontSize: 11 },
});
