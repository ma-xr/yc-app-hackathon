import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { api } from '../../convex/_generated/api';
import { SignIn } from '@/components/sign-in';
import { authStorage, convex } from '@/lib/convex';
import { useLocationTracking } from '@/lib/location';
import { useEveningCheckIn } from '@/lib/notifications';
import { useJesseFonts } from '@/theme/fonts';
import { C } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.surface, primary: C.accent, text: C.ink },
};

export default function RootLayout() {
  const fontsReady = useJesseFonts();
  useEffect(() => {
    if (fontsReady) SplashScreen.hideAsync();
  }, [fontsReady]);
  if (!fontsReady) return null;

  return (
    <ConvexAuthProvider
      client={convex}
      storage={authStorage}
      ambientSignIns={[]}
      api={{
        refreshSession: api.auth.refreshSession,
        signOut: api.auth.signOut,
        isAuthenticated: api.auth.isAuthenticated,
      }}>
      <ThemeProvider value={theme}>
        <AuthLoading>{null}</AuthLoading>
        <Unauthenticated>
          <SignIn />
        </Unauthenticated>
        <Authenticated>
          <SignedInApp />
        </Authenticated>
      </ThemeProvider>
    </ConvexAuthProvider>
  );
}

function SignedInApp() {
  useEveningCheckIn();
  useLocationTracking();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reflect" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="your-jesse" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
