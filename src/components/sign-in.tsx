import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
  type SignInWithUsernamePasswordResult,
  type SignUpWithUsernamePasswordResult,
} from '@convex-dev/auth/methods/username-password/react';
import { type ComponentRef, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { api } from '../../convex/_generated/api';
import { Enter } from '@/components/motion';
import { OrbArt } from '@/components/orb';
import { PressableScale } from '@/components/pressable-scale';
import { Button, Screen } from '@/components/ui';
import { PREF, setPref } from '@/lib/prefs';
import { fadeIn, fadeOut, layout } from '@/theme/motion';
import { C, F, S, T } from '@/theme/tokens';

type AuthError = Extract<
  SignInWithUsernamePasswordResult | SignUpWithUsernamePasswordResult,
  { status: 'error' }
>['userError'];

function chars(n: number) {
  return n === 1 ? '1 character' : `${n} characters`;
}

function errorMessage(userError: AuthError) {
  switch (userError.error) {
    case 'USER_NOT_FOUND':
      return 'No account exists with that username.';
    case 'INVALID_CREDENTIALS':
      return 'Incorrect username or password.';
    case 'USERNAME_TAKEN':
      return 'That username is already taken.';
    case 'USERNAME_TOO_SHORT':
      return `Username must be at least ${chars(userError.minimumLength)}.`;
    case 'USERNAME_TOO_LONG':
      return `Username must be at most ${chars(userError.maximumLength)}.`;
    case 'USERNAME_HAS_SURROUNDING_WHITESPACE':
      return "Username can't start or end with whitespace.";
    case 'USERNAME_HAS_INVALID_CHARACTERS':
      return "Username contains characters that aren't allowed.";
    case 'PASSWORD_TOO_SHORT':
      return `Password must be at least ${chars(userError.minimumLength)}.`;
    case 'PASSWORD_TOO_LONG':
      return `Password must be at most ${chars(userError.maximumLength)}.`;
    case 'PASSWORD_HAS_SURROUNDING_WHITESPACE':
      return "Password can't start or end with whitespace.";
    case 'PASSWORD_TOO_COMMON':
      return 'That password is too common. Please choose a different one.';
    case 'RATE_LIMITED':
      return `Too many attempts. Try again in ${Math.ceil(userError.retryAfterMs / 1000)} seconds.`;
    case 'OTHER_ERROR':
      console.error('Auth failed:', userError.cause);
      return 'Something went wrong. Please try again.';
    default:
      userError satisfies never;
      return 'Something went wrong. Please try again.';
  }
}

export function SignIn() {
  const { signIn, pending: signInPending } = useSignInWithUsernamePassword(api.auth);
  const { signUp, pending: signUpPending } = useSignUpWithUsernamePassword(api.auth);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const pending = signInPending || signUpPending || submitting;

  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result =
        mode === 'signIn' ? await signIn({ username, password }) : await signUp({ username, password });
      if (result.status === 'error') {
        setError(errorMessage(result.userError));
        return;
      }
      void setPref(PREF.username, username.trim());
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} keyboard contentStyle={styles.content}>
      <View style={styles.form}>
        <Enter index={0} style={{ alignItems: 'center' }}>
          <OrbArt size={150} pose="happy" />
        </Enter>
        <Enter index={1} style={styles.group}>
          <Text style={styles.title} accessibilityRole="header">
            {mode === 'signIn' ? 'Welcome back.' : 'Meet Jesse.'}
          </Text>
          <Text style={[T.body, { color: C.muted, marginTop: -6 }]}>
            {mode === 'signIn' ? 'Log in to walk home with Jesse.' : 'Jesse remembers the people you talk with, so you can show up for them.'}
          </Text>
        </Enter>
        <Enter index={2} style={styles.group}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            placeholderTextColor={C.muted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!pending}
          />
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={C.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            returnKeyType="go"
            editable={!pending}
            onSubmitEditing={() => void submit()}
          />
          {error ? (
            <Animated.Text
              key={error}
              entering={fadeIn}
              exiting={fadeOut}
              layout={layout}
              accessibilityRole="alert"
              style={styles.error}>
              {error}
            </Animated.Text>
          ) : null}
        </Enter>
        <Enter index={3} style={styles.group}>
          <Button
            label={pending ? 'Please wait…' : mode === 'signIn' ? 'Log in' : 'Create account'}
            disabled={pending}
            onPress={() => void submit()}
            style={styles.submit}
          />
          <PressableScale
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
            }}
            disabled={pending}
            style={styles.toggle}>
            <Animated.Text key={mode} entering={fadeIn} style={styles.link}>
              {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </Animated.Text>
          </PressableScale>
        </Enter>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 0, paddingTop: 0 },
  form: { width: '100%', maxWidth: 420, padding: 24, gap: 14 },
  group: { gap: 14 },
  title: { fontFamily: F.display, fontSize: 34, lineHeight: 40, color: C.ink },
  input: {
    fontFamily: F.regular,
    fontSize: 16,
    color: C.ink,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  error: { fontFamily: F.medium, fontSize: 14, color: C.amberText },
  submit: { minHeight: 54, marginTop: 4 },
  toggle: { alignSelf: 'center', minHeight: S.touch, justifyContent: 'center', paddingHorizontal: 12 },
  link: { fontFamily: F.semibold, fontSize: 14, color: C.accent },
});
