import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export async function getPref(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(key) ?? null;
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string) {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

export const PREF = {
  username: 'jesse.username',
  voiceMuted: 'jesse.voiceMuted',
  greetedOn: 'jesse.greetedOn',
  look: 'jesse.look',
  capturePaused: 'jesse.capturePaused',
};
