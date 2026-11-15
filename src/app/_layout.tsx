import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { api } from '../../convex/_generated/api';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { SignIn } from '@/components/sign-in';
import { authStorage, convex } from '@/lib/convex';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
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
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AuthLoading>{null}</AuthLoading>
        <Unauthenticated>
          <SignIn />
        </Unauthenticated>
        <Authenticated>
          <AppTabs />
        </Authenticated>
      </ThemeProvider>
    </ConvexAuthProvider>
  );
}
