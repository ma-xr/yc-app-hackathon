import { useMutation, useQuery } from 'convex/react';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { api } from '../../convex/_generated/api';

const CHECK_IN_ID = 'jesse-evening-check-in';
const CHECK_IN_SOON_ID = 'jesse-check-in-soon';
const CATEGORY_ID = 'jesse-checkin';
const SNOOZE_SECONDS = 30 * 60;
const CHANNEL_ID = 'evening-check-in';
const SETTINGS_KEY = 'jesse.checkIn';

export const CHECK_IN_TITLE = 'Is now a good time?';

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
  void Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    { identifier: 'yes', buttonTitle: "Yes, let's talk", options: { opensAppToForeground: true } },
    { identifier: 'later', buttonTitle: 'Later', options: { opensAppToForeground: false } },
  ]);
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

async function canNotify() {
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
  return true;
}

function checkInContent(question?: string | null): Notifications.NotificationContentInput {
  return {
    title: CHECK_IN_TITLE,
    body: question ?? 'Jesse has one question about your day.',
    data: { url: '/reflect', question: question ?? null },
    categoryIdentifier: CATEGORY_ID,
    sound: 'default',
  };
}

export async function scheduleCheckInSoon(seconds: number, question?: string | null) {
  if (Platform.OS === 'web' || !(await canNotify())) {
    return false;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: CHECK_IN_SOON_ID,
    content: checkInContent(question),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CHANNEL_ID },
  });
  return true;
}

export async function scheduleCheckIn(settings: CheckInSettings, question?: string | null) {
  if (Platform.OS === 'web') {
    return false;
  }
  await Notifications.cancelScheduledNotificationAsync(CHECK_IN_ID);
  if (!settings.enabled || !(await canNotify())) {
    return false;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: CHECK_IN_ID,
    content: checkInContent(question),
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

const useLastNotificationResponse =
  Platform.OS === 'web' ? () => null : Notifications.useLastNotificationResponse;

export function useCheckInNow() {
  const tonight = useQuery(api.reflections.tonight, { date: localDate() });
  const markCheckIn = useMutation(api.reflections.markCheckIn);
  return useCallback(async () => {
    const scheduled = await scheduleCheckInSoon(3, tonight?.question);
    if (scheduled) {
      void markCheckIn({
        date: localDate(),
        state: 'asked',
        question: tonight?.question,
        topicId: tonight?.topicId ?? undefined,
      }).catch(() => {});
    }
    return scheduled;
  }, [tonight, markCheckIn]);
}

export function useEveningCheckIn() {
  const tonight = useQuery(api.reflections.tonight, { date: localDate() });
  const markCheckIn = useMutation(api.reflections.markCheckIn);
  const question = tonight && tonight.summary === null ? tonight.question : null;
  const lastResponse = useLastNotificationResponse();
  const handled = useRef(new Set<string>());
  const latest = useRef({ tonight, markCheckIn });

  useEffect(() => {
    latest.current = { tonight, markCheckIn };
  }, [tonight, markCheckIn]);

  const mark = useCallback((state: 'asked' | 'accepted' | 'snoozed', fallbackQuestion?: string | null) => {
    const { tonight: current, markCheckIn: mutate } = latest.current;
    void mutate({
      date: localDate(),
      state,
      question: current?.question ?? fallbackQuestion ?? undefined,
      topicId: current?.topicId ?? undefined,
    }).catch(() => {});
  }, []);

  const respond = useCallback(
    (response: Notifications.NotificationResponse) => {
      const { request } = response.notification;
      if (request.content.data?.url !== '/reflect') {
        return;
      }
      const key = `${request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
      if (handled.current.has(key)) {
        return;
      }
      handled.current.add(key);
      Notifications.clearLastNotificationResponse();
      const notified = typeof request.content.data.question === 'string' ? request.content.data.question : null;
      if (response.actionIdentifier === 'later') {
        mark('snoozed', notified);
        void scheduleCheckInSoon(SNOOZE_SECONDS, notified ?? latest.current.tonight?.question);
        return;
      }
      mark('accepted', notified);
      router.push('/reflect?voice=1');
    },
    [mark],
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    const responses = Notifications.addNotificationResponseReceivedListener(respond);
    const received = Notifications.addNotificationReceivedListener((notification) => {
      if (notification.request.content.categoryIdentifier === CATEGORY_ID) {
        const notified = notification.request.content.data?.question;
        mark('asked', typeof notified === 'string' ? notified : null);
      }
    });
    return () => {
      responses.remove();
      received.remove();
    };
  }, [respond, mark]);

  useEffect(() => {
    if (lastResponse) {
      respond(lastResponse);
    }
  }, [lastResponse, respond]);

  useEffect(() => {
    if (tonight === undefined) {
      return;
    }
    void getCheckInSettings().then((settings) => scheduleCheckIn(settings, question));
  }, [tonight, question]);
}
