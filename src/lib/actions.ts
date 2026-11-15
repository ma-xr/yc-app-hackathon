import { Alert, Linking, Platform } from 'react-native';

// Stub owned by the Follow-ups thread (YCAP-10); replace with expo-sms / expo-calendar, same shape.
export async function openComposer(opts: { phone?: string; body: string }): Promise<void> {
  const sep = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${opts.phone ?? ''}${sep}body=${encodeURIComponent(opts.body)}`;
  if (Platform.OS !== 'web' && (await Linking.canOpenURL(url))) {
    await Linking.openURL(url);
    return;
  }
  Alert.alert('Text ready', opts.body);
}

export async function addToCalendar(opts: {
  title: string;
  startAt: number;
  endAt?: number;
  notes?: string;
}): Promise<string | undefined> {
  Alert.alert('Added to calendar', `${opts.title} · ${new Date(opts.startAt).toLocaleString()}`);
  return undefined;
}
