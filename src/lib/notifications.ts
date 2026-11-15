import { useQuery } from 'convex/react';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from '../../convex/_generated/api';

const CHECK_IN_ID = 'jesse-evening-check-in';
const CHANNEL_ID = 'evening-check-in';
const SETTINGS_KEY = 'jesse.checkIn';

export const CHECK_IN_TITLE = 'Got a minute to talk about today?';

export type CheckInSettings = { enabled: boolean; hour: number; minute: number };

export const DEFAULT_CHECK_IN: CheckInSettings = { enabled: true, hour: 21, minute: 30 };

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export function localDate(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatCheckInTime({ hour, minute }: CheckInSettings) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

let webSettings = DEFAULT_CHECK_IN;

export async function getCheckInSettings(): Promise<CheckInSettings> {
  if (Platform.OS === 'web') {
    return webSettings;
  }
  const saved = await SecureStore.getItemAsync(SETTINGS_KEY);
  return saved ? { ...DEFAULT_CHECK_IN, ...(JSON.parse(saved) as Partial<CheckInSettings>) } : DEFAULT_CHECK_IN;
}

export async function scheduleCheckIn(settings: CheckInSettings, question?: string | null) {
  if (Platform.OS === 'web') {
    return false;
  }
  await Notifications.cancelScheduledNotificationAsync(CHECK_IN_ID);
  if (!settings.enabled) {
    return false;
  }
  let { granted } = await Notifications.getPermissionsAsync();
  if (!granted) {
    ({ granted } = await Notifications.requestPermissionsAsync());
  }
  if (!granted) {
    return false;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Evening check-in',
      importance: AndroidImportance.HIGH,
    });
  }
  await Notifications.scheduleNotificationAsync({
    identifier: CHECK_IN_ID,
    content: {
      title: CHECK_IN_TITLE,
      body: question ?? 'Jesse has one question about your day.',
      data: { url: '/reflect' },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.hour,
      minute: settings.minute,
      channelId: CHANNEL_ID,
    },
  });
  return true;
}

export async function saveCheckInSettings(settings: CheckInSettings, question?: string | null) {
  if (Platform.OS === 'web') {
    webSettings = settings;
  } else {
    await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
  }
  return await scheduleCheckIn(settings, question);
}

export function useEveningCheckIn() {
  const tonight = useQuery(api.reflections.tonight, { date: localDate() });
  const question = tonight && tonight.summary === null ? tonight.question : null;

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    function open(notification: Notifications.Notification) {
      if (notification.request.content.data?.url === '/reflect') {
        router.push('/reflect');
        Notifications.clearLastNotificationResponse();
      }
    }
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) {
      open(last.notification);
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response.notification),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (tonight === undefined) {
      return;
    }
    void getCheckInSettings().then((settings) => scheduleCheckIn(settings, question));
  }, [tonight, question]);
}
