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
import { Platform } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export type Listening = {
  isListening: boolean;
  status: string | null;
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
};

const CHUNK_MS = 45_000;

const SPEECH: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
};

async function readAndDiscard(uri: string) {
  if (Platform.OS === 'web') {
    const audio = await (await fetch(uri)).arrayBuffer();
    URL.revokeObjectURL(uri);
    return audio;
  }
  const file = new File(uri);
  try {
    return await file.arrayBuffer();
  } finally {
    if (file.exists) file.delete();
  }
}

export function useListening(): Listening {
  const recorder = useAudioRecorder(SPEECH);
  const startConversation = useMutation(api.conversations.start);
  const stopConversation = useMutation(api.conversations.stop);
  const processChunk = useAction(api.extract.processChunk);

  const [conversationId, setConversationId] = useState<Id<'conversations'> | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotating = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(new Set<Promise<unknown>>());

  const conversation = useQuery(api.conversations.get, conversationId ? { conversationId } : 'skip');

  const report = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  const takeChunk = useCallback(
    async (id: Id<'conversations'>, again: boolean) => {
      await recorder.stop();
      const uri = recorder.uri;
      if (again) {
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
      if (!uri) return;
      const audio = await readAndDiscard(uri);
      const sent = processChunk({ conversationId: id, audio }).catch(report);
      inFlight.current.add(sent);
      void sent.finally(() => inFlight.current.delete(sent));
    },
    [processChunk, recorder, report],
  );

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
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const id = await startConversation({});
      setConversationId(id);
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsListening(true);
      timer.current = setInterval(() => {
        rotating.current = rotating.current.then(() => takeChunk(id, true)).catch(report);
      }, CHUNK_MS);
    } catch (e) {
      busy.current = false;
      report(e);
    }
  }, [recorder, report, startConversation, takeChunk]);

  const stop = useCallback(async () => {
    if (!busy.current || conversationId === null || !isListening) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setIsListening(false);
    setIsFinishing(true);
    try {
      await rotating.current;
      await takeChunk(conversationId, false);
      await Promise.all(inFlight.current);
    } catch (e) {
      report(e);
    } finally {
      await stopConversation({ conversationId }).catch(report);
      await setAudioModeAsync({ allowsRecording: false }).catch(report);
      setIsFinishing(false);
      busy.current = false;
    }
  }, [conversationId, isListening, report, stopConversation, takeChunk]);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
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

  return { isListening, status, start, stop };
}
