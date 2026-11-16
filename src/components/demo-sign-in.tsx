import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
} from '@convex-dev/auth/methods/username-password/react';
import { useMutation } from 'convex/react';
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import { OrbArt } from '@/components/orb';
import { PREF, setPref } from '@/lib/prefs';
import { C, T } from '@/theme/tokens';

// Web demo build (EXPO_PUBLIC_DEMO=1): every visitor lands in one shared demo account.
export const IS_DEMO = process.env.EXPO_PUBLIC_DEMO === '1';
const DEMO_USER = 'jessewebdemo2026';
const DEMO_PASS = 'Capybara-Walks-Home-2026';
const NEW_FLAG = 'jesse-demo-needs-seed';

export function DemoSignIn() {
  const { signIn } = useSignInWithUsernamePassword(api.auth);
  const { signUp } = useSignUpWithUsernamePassword(api.auth);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      void setPref(PREF.username, 'Max');
      const res = await signIn({ username: DEMO_USER, password: DEMO_PASS });
      if (res.status === 'error') {
        try { sessionStorage.setItem(NEW_FLAG, '1'); } catch {}
        await signUp({ username: DEMO_USER, password: DEMO_PASS });
      }
    })();
  }, [signIn, signUp]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <OrbArt size={150} pose="happy" />
      <Text style={[T.body, { color: C.muted }]}>Waking Jesse up…</Text>
    </View>
  );
}

// Fills a freshly created demo account with demo memories, once.
export function useSeedNewDemoAccount() {
  const seedDemo = useMutation(api.seed.demo);
  const runScenario = useMutation(api.scenarios.run);
  useEffect(() => {
    if (!IS_DEMO) return;
    let isNew = false;
    try { isNew = sessionStorage.getItem(NEW_FLAG) === '1'; sessionStorage.removeItem(NEW_FLAG); } catch {}
    if (!isNew) return;
    void (async () => {
      await seedDemo({});
      for (const name of ['tim', 'mom', 'deck'] as const) await runScenario({ name });
    })();
  }, [seedDemo, runScenario]);
}
