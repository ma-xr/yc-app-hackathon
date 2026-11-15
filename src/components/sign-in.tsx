import {
  useSignInWithUsernamePassword,
  useSignUpWithUsernamePassword,
  type SignInWithUsernamePasswordResult,
  type SignUpWithUsernamePasswordResult,
} from '@convex-dev/auth/methods/username-password/react';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';

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
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
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
    }
  };

  const inputStyle = [styles.input, { color: colors.text, borderColor: colors.backgroundSelected }];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.form}>
        <ThemedText type="title">{mode === 'signIn' ? 'Log in' : 'Sign up'}</ThemedText>
        <TextInput
          style={inputStyle}
          placeholder="Username"
          placeholderTextColor={colors.textSecondary}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          editable={!pending}
        />
        <TextInput
          style={inputStyle}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
          editable={!pending}
          onSubmitEditing={submit}
        />
        {error ? <ThemedText style={{ color: 'red' }}>{error}</ThemedText> : null}
        <Pressable onPress={submit} disabled={pending}>
          <ThemedView type="backgroundSelected" style={styles.button}>
            <ThemedText type="smallBold">
              {pending ? 'Please wait…' : mode === 'signIn' ? 'Log in' : 'Create account'}
            </ThemedText>
          </ThemedView>
        </Pressable>
        <Pressable
          onPress={() => {
            setError(null);
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          }}
          disabled={pending}>
          <ThemedText type="link">
            {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
});
