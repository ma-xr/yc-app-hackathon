import { useAction, useMutation, useQuery } from 'convex/react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export type Listening = {
  isListening: boolean;
  startedAt: number | null;
  status: string | null;
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
};

const CHUNK_MS = 45_000;
const TICK_MS = 5_000;

const SPEECH: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
};

function discard(uri: string | null) {
  if (!uri) return;
  try {
    if (Platform.OS === 'web') {
      URL.revokeObjectURL(uri);
      return;
    }
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

async function read(uri: string) {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

export function useListening(): Listening {
  const recorder = useAudioRecorder(SPEECH);
  const startConversation = useMutation(api.conversations.start);
  const stopConversation = useMutation(api.conversations.stop);
  const processChunk = useAction(api.extract.processChunk);

  const [conversationId, setConversationId] = useState<Id<'conversations'> | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotating = useRef<Promise<void>>(Promise.resolve());
  const chunkStartedAt = useRef(0);
  const active = useRef<Id<'conversations'> | null>(null);
  const inFlight = useRef(new Set<Promise<unknown>>());

  const conversation = useQuery(api.conversations.get, conversationId ? { conversationId } : 'skip');

  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  const takeChunk = useCallback(
    async (id: Id<'conversations'>, again: boolean) => {
      await recorder.stop();
      const uri = recorder.uri;
      try {
        if (again) {
          await recorder.prepareToRecordAsync();
          recorder.record();
          chunkStartedAt.current = Date.now();
        }
      } finally {
        if (uri) {
          const sent = read(uri)
            .then((audio) => processChunk({ conversationId: id, audio }))
            .catch(report)
            .finally(() => discard(uri));
          inFlight.current.add(sent);
          void sent.finally(() => inFlight.current.delete(sent));
        }
      }
    },
    [processChunk, recorder, report],
  );

  const rollIfDue = useCallback(() => {
    const id = active.current;
    if (id === null || Date.now() - chunkStartedAt.current < CHUNK_MS) return;
    chunkStartedAt.current = Date.now();
    rotating.current = rotating.current.then(() => (active.current === id ? takeChunk(id, true) : undefined)).catch(report);
  }, [report, takeChunk]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && rollIfDue());
    return () => sub.remove();
  }, [rollIfDue]);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setError(null);
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setError('Jesse needs the microphone to listen');
        busy.current = false;
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        allowsBackgroundRecording: true,
      });
      const id = await startConversation({});
      setConversationId(id);
      await recorder.prepareToRecordAsync();
      recorder.record();
      const now = Date.now();
      chunkStartedAt.current = now;
      active.current = id;
      setStartedAt(now);
      setIsListening(true);
      timer.current = setInterval(rollIfDue, TICK_MS);
    } catch (e) {
      busy.current = false;
      report(e);
    }
  }, [recorder, report, rollIfDue, startConversation]);

  const stop = useCallback(async () => {
    if (!busy.current || conversationId === null || !isListening) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    active.current = null;
    setIsListening(false);
    setStartedAt(null);
    setIsFinishing(true);
    try {
      await rotating.current;
      await takeChunk(conversationId, false);
      await Promise.all(inFlight.current);
    } catch (e) {
      report(e);
    } finally {
      discard(recorder.uri);
      await stopConversation({ conversationId }).catch(report);
      await setAudioModeAsync({ allowsRecording: false }).catch(report);
      setIsFinishing(false);
      busy.current = false;
    }
  }, [conversationId, isListening, recorder, report, stopConversation, takeChunk]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      if (active.current === null) return;
      active.current = null;
      void (async () => {
        try {
          await recorder.stop();
        } catch {}
        try {
          discard(recorder.uri);
        } catch {}
      })();
    },
    [recorder],
  );

  let status: string | null = null;
  if (error) {
    status = error;
  } else if (isListening) {
    const names = conversation?.people.map((p) => p.name.split(' ')[0]) ?? [];
    status = names.length === 0 ? 'Listening…' : `Listening · ${names.length + 1} people · ${names.join(', ')}?`;
  } else if (isFinishing || conversation?.status === 'processing') {
    status = 'Noting what mattered…';
  }

  return { isListening, startedAt, status, start, stop };
}
