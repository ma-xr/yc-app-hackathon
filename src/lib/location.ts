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
const OWNER_KEY = 'jesse.locationOwner';
const TAG_RETRY_MS = 30_000;
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
  owner?: string;
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
  if (paused) tracking = false;
  setStatus({ paused });
  await setPref(PAUSED_KEY, paused ? '1' : '0');
  if (paused) {
    await stopBackground();
    await clearQueue();
  }
}

function toPing(location: Location.LocationObject, source: Ping['source'], pingOwner: string): Ping {
  return {
    owner: pingOwner,
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
let owner: string | null = null;
let tracking = false;
let flushing = false;

const pingKey = (p: Ping) => `${p.owner}|${p.source}|${p.ts}|${p.lat}|${p.lng}`;

function enqueue(pings: Ping[]) {
  return serial(() => writeQueue([...readQueue(), ...pings]));
}

function clearQueue() {
  return serial(() => writeQueue([]));
}

async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    while (upload && owner) {
      const send = upload;
      const current = owner;
      const batch = await serial(async () => {
        const queue = readQueue();
        const mine = queue.filter((p) => p.owner === current);
        if (mine.length !== queue.length) await writeQueue(mine);
        return mine.slice(0, UPLOAD_BATCH);
      });
      if (!batch.length) return;
      for (const ping of batch) ping.placeName ??= await placeName(ping.lat, ping.lng);
      try {
        await send(batch.map(({ owner: _owner, ...ping }) => ping));
      } catch {
        return;
      }
      const sent = new Set(batch.map(pingKey));
      await serial(() => writeQueue(readQueue().filter((p) => !sent.has(pingKey(p)))));
    }
  } finally {
    flushing = false;
  }
}

let last: Ping | null = null;

async function capture(location: Location.LocationObject) {
  if (!tracking || !owner) return;
  const ping = toPing(location, 'foreground', owner);
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
    const signedIn = owner ?? (await getPref(OWNER_KEY));
    if (!signedIn) return;
    await enqueue(data.locations.map((l) => toPing(l, 'background', signedIn)));
    await flush();
  });
}

async function tagConversation(
  conversationId: Id<'conversations'>,
  record: (args: { pings: Omit<Ping, 'owner'>[]; conversationId: Id<'conversations'> }) => Promise<unknown>,
) {
  const location =
    (await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 200 }).catch(() => null)) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
  const current = owner;
  if (!location || !tracking || !current) return false;
  const { owner: _owner, ...ping } = toPing(location, 'conversation', current);
  ping.placeName = await placeName(ping.lat, ping.lng);
  if (!tracking || owner !== current) return false;
  try {
    await record({ pings: [ping], conversationId });
  } catch {
    return false;
  }
  last = { ...ping, owner: current };
  return true;
}

export function useLocationTracking() {
  const record = useMutation(api.places.record);
  const info = useQuery(api.places.status, {});
  const pending = useQuery(api.places.pendingTag, {});
  const { ready, permission, paused, background, backgroundAvailable } = useLocationStatus();
  const tagged = useRef(new Set<string>());
  const tagging = useRef(new Set<string>());
  const ownerId = info?.ownerId ?? null;
  const active = ready && permission === 'granted' && !paused && ownerId !== null;

  useEffect(() => {
    void refreshLocationStatus();
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshLocationStatus();
      void flush();
    });
    return () => {
      sub.remove();
      tracking = false;
      owner = null;
      void setPref(OWNER_KEY, '');
      void stopBackground();
      void clearQueue();
    };
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    owner = ownerId;
    void setPref(OWNER_KEY, ownerId);
    upload = (pings) => record({ pings });
    void flush();
    return () => {
      upload = null;
    };
  }, [ownerId, record]);

  useEffect(() => {
    if (!active) return;
    tracking = true;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    const sample = () =>
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((location) => (cancelled ? undefined : capture(location)))
        .catch(() => {});
    void sample();
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: MOVE_M, timeInterval: SAMPLE_MS },
      (location) => void (cancelled ? undefined : capture(location)),
    )
      .then((s) => (cancelled ? s.remove() : (subscription = s)))
      .catch(() => {});
    const timer = setInterval(sample, SAMPLE_MS);
    return () => {
      cancelled = true;
      tracking = false;
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
    const attempt = () => {
      if (tagged.current.has(conversationId) || tagging.current.has(conversationId)) return;
      if (Date.now() - startedAt > TAG_WINDOW_MS) return;
      tagging.current.add(conversationId);
      void tagConversation(conversationId, record).then((done) => {
        tagging.current.delete(conversationId);
        if (done) tagged.current.add(conversationId);
      });
    };
    attempt();
    const timer = setInterval(attempt, TAG_RETRY_MS);
    return () => clearInterval(timer);
  }, [active, pending, record]);
}
