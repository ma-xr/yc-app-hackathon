import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { C } from '@/theme/tokens';

// Jesse is a phone app. On a wide browser window, show it as a centered phone-sized
// screen instead of stretching every layout across the desktop.
const PHONE_W = 430;
const PHONE_H = 932;

export function WebFrame({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web') return <>{children}</>;
  // Same tree at every width, so resizing across the breakpoint doesn't remount the app.
  const framed = width > PHONE_W + 40;
  return (
    <View style={[styles.fill, framed && styles.page]}>
      <View style={framed ? [styles.phone, { height: Math.min(PHONE_H, height - 48) }] : styles.fill}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%' },
  page: { backgroundColor: C.night, alignItems: 'center', justifyContent: 'center' },
  phone: {
    width: PHONE_W,
    backgroundColor: C.bg,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
    boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
  },
});
