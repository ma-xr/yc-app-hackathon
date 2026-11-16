import { useMutation, useQuery } from 'convex/react';
import { isRunningInExpoGo } from 'expo';
import { File, Paths } from 'expo-file-system';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { distanceM } from '../../convex/lib/places';
import { getPref, setPref } from '@/lib/prefs';

const TASK = 'jesse-background-location';
const PAUSED_KEY = 'jesse.locationPaused';
const SAMPLE_MS = 5 * 60_000;
const MOVE_M = 150;
const SAME_SPOT_M = 50;
const MIN_GAP_MS = 2 * 60_000;
const NAME_REUSE_M = 120;
const GEOCODE_GAP_MS = 20_000;
const TAG_WINDOW_MS = 10 * 60_000;
const QUEUE_MAX = 1000;
const UPLOAD_BATCH = 200;

type Ping = {
  lat: number;
  lng: number;
  accuracy?: number;
  ts: number;
  placeName?: string;
  source: 'foreground' | 'background' | 'conversation';
};

export type LocationStatus = {
  ready: boolean;
  permission: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
  background: boolean;
  backgroundAvailable: boolean;
  paused: boolean;
};

const canRunInBackground = Platform.OS !== 'web' && !isRunningInExpoGo();

let status: LocationStatus = {
  ready: false,
  permission: 'undetermined',
  canAskAgain: true,
  background: false,
  backgroundAvailable: false,
  paused: false,
};
const listeners = new Set<() => void>();

function setStatus(patch: Partial<LocationStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function useLocationStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}

export async function refreshLocationStatus() {
  const [foreground, paused] = await Promise.all([
    Location.getForegroundPermissionsAsync().catch(() => null),
    getPref(PAUSED_KEY),
  ]);
  let backgroundAvailable = false;
  let background = false;
  if (canRunInBackground) {
    backgroundAvailable =
      (await Location.isBackgroundLocationAvailableAsync().catch(() => false)) &&
      (await TaskManager.isAvailableAsync().catch(() => false));
    if (backgroundAvailable) {
      background = (await Location.getBackgroundPermissionsAsync().catch(() => null))?.status === 'granted';
    }
  }
  setStatus({
    ready: true,
    permission: foreground?.status ?? 'undetermined',
    canAskAgain: foreground?.canAskAgain ?? true,
    background,
    backgroundAvailable,
    paused: paused === '1',
  });
}

export async function enableLocation() {
  const { status: result, canAskAgain } = await Location.requestForegroundPermissionsAsync().catch(() => ({
    status: 'denied' as const,
    canAskAgain: false,
  }));
  if (result === 'granted') await setLocationPaused(false);
  else if (!canAskAgain && Platform.OS !== 'web') void Linking.openSettings();
  await refreshLocationStatus();
  return result === 'granted';
}

export async function enableBackgroundLocation() {
  const result = await Location.requestBackgroundPermissionsAsync().catch(() => null);
  if (result?.status !== 'granted') void Linking.openSettings();
  await refreshLocationStatus();
}

export async function setLocationPaused(paused: boolean) {
  await setPref(PAUSED_KEY, paused ? '1' : '0');
  if (paused) {
    await stopBackground();
    await clearQueue();
  }
  setStatus({ paused });
}

function toPing(location: Location.LocationObject, source: Ping['source']): Ping {
  return {
    lat: location.coords.latitude,
    lng: location.coords.longitude,
    accuracy: location.coords.accuracy ?? undefined,
    ts: Math.round(location.timestamp),
    source,
  };
}

function shortName(address: Location.LocationGeocodedAddress) {
  const street = [address.streetNumber, address.street].filter(Boolean).join(' ');
  if (address.name && address.name !== street && address.name !== address.street && !/^\d/.test(address.name)) {
    return address.name;
  }
  return address.street ?? address.district ?? address.subregion ?? address.city ?? undefined;
}

const named: { lat: number; lng: number; name: string | undefined }[] = [];
let lastGeocodeAt = 0;

async function placeName(lat: number, lng: number) {
  const known = named.find((n) => distanceM(n, { lat, lng }) <= NAME_REUSE_M);
  if (known) return known.name;
  if (Platform.OS === 'web' || AppState.currentState !== 'active' || Date.now() - lastGeocodeAt < GEOCODE_GAP_MS) {
    return undefined;
  }
  lastGeocodeAt = Date.now();
  const [address] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }).catch(() => []);
  const name = address ? shortName(address) : undefined;
  named.unshift({ lat, lng, name });
  named.length = Math.min(named.length, 30);
  return name;
}

let memoryQueue: Ping[] = [];
const queueFile = () => new File(Paths.document, 'jesse-location-queue.json');

function readQueue(): Ping[] {
  if (Platform.OS === 'web') return memoryQueue;
  try {
    const file = queueFile();
    return file.exists ? (JSON.parse(file.textSync()) as Ping[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: Ping[]) {
  const kept = queue.slice(-QUEUE_MAX);
  if (Platform.OS === 'web') {
    memoryQueue = kept;
    return;
  }
  try {
    const file = queueFile();
    if (!kept.length) {
      if (file.exists) file.delete();
      return;
    }
    if (!file.exists) file.create();
    await file.write(JSON.stringify(kept));
  } catch {}
}

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>) {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

let upload: ((pings: Ping[]) => Promise<unknown>) | null = null;

function enqueue(pings: Ping[]) {
  return serial(() => writeQueue([...readQueue(), ...pings]));
}

function clearQueue() {
  return serial(() => writeQueue([]));
}

function flush() {
  return serial(async () => {
    const send = upload;
    let queue = readQueue();
    while (send && queue.length) {
      const batch = queue.slice(0, UPLOAD_BATCH);
      for (const ping of batch) ping.placeName ??= await placeName(ping.lat, ping.lng);
      try {
        await send(batch);
      } catch {
        await writeQueue(queue);
        return;
      }
      queue = queue.slice(batch.length);
    }
    await writeQueue(queue);
  });
}

let last: Ping | null = null;

async function capture(location: Location.LocationObject) {
  const ping = toPing(location, 'foreground');
  if (last && ping.ts - last.ts < MIN_GAP_MS && distanceM(last, ping) < SAME_SPOT_M) return;
  last = ping;
  await enqueue([ping]);
  await flush();
}

async function startBackground() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) return;
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: MOVE_M,
    timeInterval: SAMPLE_MS,
    deferredUpdatesInterval: SAMPLE_MS,
    deferredUpdatesDistance: MOVE_M,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.Other,
    showsBackgroundLocationIndicator: false,
    foregroundService: {
      notificationTitle: 'Jesse is noting places',
      notificationBody: 'Pause it any time in Connections.',
    },
  }).catch(() => {});
}

async function stopBackground() {
  if (!canRunInBackground) return;
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
}

if (canRunInBackground) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    if ((await getPref(PAUSED_KEY)) === '1') return;
    await enqueue(data.locations.map((l) => toPing(l, 'background')));
    await flush();
  });
}

async function tagConversation(
  conversationId: Id<'conversations'>,
  record: (args: { pings: Ping[]; conversationId: Id<'conversations'> }) => Promise<unknown>,
) {
  const location =
    (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 200 }).catch(() => null)) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
  if (!location) return;
  const ping = toPing(location, 'conversation');
  ping.placeName = await placeName(ping.lat, ping.lng);
  last = ping;
  await record({ pings: [ping], conversationId }).catch(() => enqueue([{ ...ping, source: 'foreground' }]));
}

export function useLocationTracking() {
  const record = useMutation(api.places.record);
  const pending = useQuery(api.places.pendingTag, {});
  const { ready, permission, paused, background, backgroundAvailable } = useLocationStatus();
  const tagged = useRef(new Set<string>());
  const active = ready && permission === 'granted' && !paused;

  useEffect(() => {
    void refreshLocationStatus();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshLocationStatus();
      void flush();
    });
    return () => {
      sub.remove();
      void clearQueue();
    };
  }, []);

  useEffect(() => {
    upload = (pings) => record({ pings });
    void flush();
    return () => {
      upload = null;
    };
  }, [record]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    const sample = () =>
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(capture)
        .catch(() => {});
    void sample();
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: MOVE_M, timeInterval: SAMPLE_MS },
      (location) => void capture(location),
    )
      .then((s) => (cancelled ? s.remove() : (subscription = s)))
      .catch(() => {});
    const timer = setInterval(sample, SAMPLE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription?.remove();
    };
  }, [active]);

  useEffect(() => {
    if (!ready || !canRunInBackground) return;
    if (active && background && backgroundAvailable) void startBackground();
    else void stopBackground();
  }, [active, background, backgroundAvailable, ready]);

  useEffect(() => {
    if (!active || !pending) return;
    const { conversationId, startedAt } = pending;
    if (tagged.current.has(conversationId) || Date.now() - startedAt > TAG_WINDOW_MS) return;
    tagged.current.add(conversationId);
    void tagConversation(conversationId, record);
  }, [active, pending, record]);
}
