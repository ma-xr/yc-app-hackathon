import { useAction } from 'convex/react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { api } from '../../convex/_generated/api';
import { getPref, PREF, setPref } from '@/lib/prefs';
import { useIsSpeaking } from '@/lib/voice';

export type CaptureState = 'off' | 'listening' | 'paused' | 'unavailable';

export const SEGMENT_MS = 10 * 60 * 1000;
const SAMPLE_MS = 2_000;
const VOICE_DB = Platform.OS === 'android' ? -30 : -40;
const MIN_VOICED_MS = 5_000;
const MAX_QUEUED = 12;
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;
const BACKOFF_MS = [2_000, 10_000, 30_000];
const QUEUE_DIR = 'jesse-segments';
const RECORDER_DIRS = ['ExpoAudio', 'Audio'];

const SEGMENT: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: 'document',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
};

type Queued = { file: File; startedAt: number; endedAt: number; voicedMs: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function queueDir(owner: string) {
  const dir = new Directory(Paths.document, QUEUE_DIR, owner);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function remove(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {}
}

function sweepRecorderLeftovers() {
  for (const name of RECORDER_DIRS) {
    try {
      const dir = new Directory(Paths.document, name);
      if (!dir.exists) continue;
      for (const entry of dir.list()) if (entry instanceof File) remove(entry);
    } catch {}
  }
}

function readQueue(owner: string) {
  const queued: Queued[] = [];
  for (const entry of queueDir(owner).list()) {
    if (!(entry instanceof File)) continue;
    const match = /^(\d+)-(\d+)-(\d+)\.m4a$/.exec(entry.name);
    if (!match) {
      remove(entry);
      continue;
    }
    queued.push({ file: entry, startedAt: Number(match[1]), endedAt: Number(match[2]), voicedMs: Number(match[3]) });
  }
  queued.sort((a, b) => a.startedAt - b.startedAt);
  const now = Date.now();
  return queued.filter((q, i) => {
    const keep = now - q.startedAt <= MAX_QUEUE_AGE_MS && i >= queued.length - MAX_QUEUED;
    if (!keep) remove(q.file);
    return keep;
  });
}

export function usePassiveCapture(): {
  state: CaptureState;
  paused: boolean;
  setPaused(p: boolean): void;
  holdForTalk(): Promise<void>;
  releaseAfterTalk(): Promise<void>;
} {
  const recorder = useAudioRecorder(SEGMENT);
  const ingest = useAction(api.capture.ingestSegment);

  const [state, setState] = useState<CaptureState>('off');
  const [paused, setPausedState] = useState(false);
  const ready = useRef(false);
  const recording = useRef(false);
  const held = useRef(false);
  const pausedRef = useRef(false);
  const segmentStartedAt = useRef(0);
  const voicedMs = useRef(0);
  const lock = useRef<Promise<void>>(Promise.resolve());
  const draining = useRef(false);
  const owner = useRef<string | null>(null);
  const speakingRef = useRef(false);
  const speaking = useIsSpeaking();

  const serial = useCallback((step: () => Promise<void>) => {
    lock.current = lock.current.then(step).catch(() => {});
    return lock.current;
  }, []);

  const drain = useCallback(async () => {
    const mine = owner.current;
    if (draining.current || mine === null) return;
    draining.current = true;
    try {
      for (const segment of readQueue(mine)) {
        for (let attempt = 0; ; attempt++) {
          if (!ready.current || owner.current !== mine) return;
          try {
            const audio = await segment.file.arrayBuffer();
            await ingest({ audio, startedAt: segment.startedAt, endedAt: segment.endedAt, voicedMs: segment.voicedMs });
            remove(segment.file);
            break;
          } catch {
            if (attempt >= BACKOFF_MS.length) return;
            await sleep(BACKOFF_MS[attempt]);
          }
        }
      }
    } catch {
    } finally {
      draining.current = false;
    }
  }, [ingest]);

  const begin = useCallback(async () => {
    if (!ready.current || recording.current || held.current || speakingRef.current || pausedRef.current) return;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        allowsBackgroundRecording: true,
        interruptionMode: 'mixWithOthers',
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      segmentStartedAt.current = Date.now();
      voicedMs.current = 0;
      recording.current = true;
      setState('listening');
    } catch {
      setState('unavailable');
    }
  }, [recorder]);

  const finish = useCallback(
    async (again: boolean) => {
      if (!recording.current) return;
      recording.current = false;
      const startedAt = segmentStartedAt.current;
      const voiced = voicedMs.current;
      try {
        await recorder.stop();
      } catch {}
      const endedAt = Date.now();
      const uri = recorder.uri;
      if (again) await begin();
      if (!uri) return;
      const file = new File(uri);
      if (voiced < MIN_VOICED_MS) {
        remove(file);
        return;
      }
      try {
        if (owner.current === null) throw new Error('no owner');
        await file.move(new File(queueDir(owner.current), `${startedAt}-${endedAt}-${voiced}.m4a`));
      } catch {
        remove(file);
        return;
      }
      void drain();
    },
    [begin, drain, recorder],
  );

  const sample = useCallback(() => {
    if (!recording.current) return;
    let status: RecorderState;
    try {
      status = recorder.getStatus();
    } catch {
      return;
    }
    if (!status.isRecording) {
      void serial(() => finish(true));
      return;
    }
    if ((status.metering ?? -160) > VOICE_DB) voicedMs.current += SAMPLE_MS;
    if (Date.now() - segmentStartedAt.current >= SEGMENT_MS) void serial(() => finish(true));
  }, [finish, recorder, serial]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (Platform.OS === 'web') {
        setState('unavailable');
        return;
      }
      const [stored, username] = await Promise.all([getPref(PREF.capturePaused), getPref(PREF.username)]);
      owner.current = (username ?? 'me').toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'me';
      const { granted } = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
      if (cancelled) return;
      pausedRef.current = stored === '1';
      setPausedState(pausedRef.current);
      if (!granted) {
        setState('unavailable');
        return;
      }
      sweepRecorderLeftovers();
      ready.current = true;
      void drain();
      if (pausedRef.current) setState('paused');
      else await serial(begin);
    })();
    const timer = setInterval(sample, SAMPLE_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void serial(begin);
    });
    return () => {
      cancelled = true;
      ready.current = false;
      clearInterval(timer);
      sub.remove();
      void serial(() => finish(false));
    };
  }, [begin, drain, finish, sample, serial]);

  useEffect(() => {
    speakingRef.current = speaking;
    if (!ready.current) return;
    void serial(() => (speaking ? finish(false) : begin()));
  }, [speaking, begin, finish, serial]);

  const setPaused = useCallback(
    (p: boolean) => {
      pausedRef.current = p;
      setPausedState(p);
      void setPref(PREF.capturePaused, p ? '1' : '0');
      if (!ready.current) return;
      void serial(async () => {
        if (!p) return begin();
        await finish(false);
        setState('paused');
      });
    },
    [begin, finish, serial],
  );

  const holdForTalk = useCallback(async () => {
    held.current = true;
    await serial(() => finish(false));
  }, [finish, serial]);

  const releaseAfterTalk = useCallback(async () => {
    held.current = false;
    await serial(begin);
  }, [begin, serial]);

  return { state, paused, setPaused, holdForTalk, releaseAfterTalk };
}
