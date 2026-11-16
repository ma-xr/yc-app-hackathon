import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { OrbArt } from '@/components/orb';
import { PressableScale } from '@/components/pressable-scale';
import { haptic, SPRING } from '@/theme/motion';
import { C, F, S } from '@/theme/tokens';

const TABS: {
  name: string;
  href: '/' | '/insights' | '/contacts';
  label: string;
  icon?: IconName;
}[] = [
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
  onPress,
  ...props
}: TabTriggerSlotProps & {
  label: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  const color = isFocused ? C.accent : C.mutedIcon;
  const focus = useSharedValue(isFocused ? 1 : 0);
  useEffect(() => {
    focus.value = withSpring(isFocused ? 1 : 0, SPRING.bouncy);
  }, [focus, isFocused]);
  const iconStyle = useAnimatedStyle(() => ({
    opacity: icon ? 1 : 0.6 + 0.4 * focus.value,
    transform: [{ scale: 0.92 + 0.08 * focus.value }, { translateY: -1.5 * focus.value }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: 0.85 + 0.15 * focus.value,
  }));
  return (
    <PressableScale
      {...props}
      onPress={(e) => {
        if (!isFocused) haptic('selection');
        onPress?.(e);
      }}
      scaleTo={0.94}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={styles.tab}>
      <Animated.View style={[styles.icon, iconStyle]}>
        {icon ? <Icon name={icon} size={22} color={color} /> : <OrbArt size={26} id="tabOrb" />}
      </Animated.View>
      <Animated.Text
        numberOfLines={1}
        style={[styles.label, labelStyle, { color, fontFamily: isFocused ? F.semibold : F.medium }]}>
        {label}
      </Animated.Text>
    </PressableScale>
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
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: S.touch,
    paddingHorizontal: 4,
  },
  icon: { height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14 },
});
