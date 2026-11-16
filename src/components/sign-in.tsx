import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
  type SignInWithUsernamePasswordResult,
  type SignUpWithUsernamePasswordResult,
} from '@convex-dev/auth/methods/username-password/react';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { OrbArt } from '@/components/orb';
import { Button } from '@/components/ui';
import { PREF, setPref } from '@/lib/prefs';
import { C, F, T } from '@/theme/tokens';

type AuthError = Extract<
  SignInWithUsernamePasswordResult | SignUpWithUsernamePasswordResult,
  { status: 'error' }
>['userError'];

function errorMessage(userError: AuthError) {
  switch (userError.error) {
    case 'USER_NOT_FOUND':
      return 'No account exists with that username.';
    case 'INVALID_CREDENTIALS':
      return 'Incorrect username or password.';
    case 'USERNAME_TAKEN':
      return 'That username is already taken.';
    case 'USERNAME_TOO_SHORT':
      return `Username must be at least ${userError.minimumLength} characters.`;
    case 'USERNAME_TOO_LONG':
      return `Username must be at most ${userError.maximumLength} characters.`;
    case 'USERNAME_HAS_SURROUNDING_WHITESPACE':
      return "Username can't start or end with whitespace.";
    case 'USERNAME_HAS_INVALID_CHARACTERS':
      return "Username contains characters that aren't allowed.";
    case 'PASSWORD_TOO_SHORT':
      return `Password must be at least ${userError.minimumLength} characters.`;
    case 'PASSWORD_TOO_LONG':
      return `Password must be at most ${userError.maximumLength} characters.`;
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
  const pending = signInPending || signUpPending;

  const submit = async () => {
    setError(null);
    const result =
      mode === 'signIn' ? await signIn({ username, password }) : await signUp({ username, password });
    if (result.status === 'error') {
      setError(errorMessage(result.userError));
      return;
    }
    void setPref(PREF.username, username.trim());
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.form}>
        <View style={{ alignItems: 'center' }}>
          <OrbArt size={150} pose="happy" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {mode === 'signIn' ? 'Welcome back.' : 'Meet Jesse.'}
        </Text>
        <Text style={[T.body, { color: C.muted, marginTop: -6 }]}>
          {mode === 'signIn' ? 'Log in to walk home with Jesse.' : 'Jesse remembers the people you talk with, so you can show up for them.'}
        </Text>
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
          editable={!pending}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={C.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
          editable={!pending}
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={pending ? 'Please wait…' : mode === 'signIn' ? 'Log in' : 'Create account'}
          onPress={pending ? undefined : submit}
          style={styles.submit}
        />
        <Pressable
          onPress={() => {
            setError(null);
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          }}
          disabled={pending}
          style={{ alignSelf: 'center' }}>
          <Text style={styles.link}>
            {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  form: { width: '100%', maxWidth: 420, padding: 24, gap: 14 },
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
  link: { fontFamily: F.semibold, fontSize: 14, color: C.accent },
});
