import { useMutation, useQuery } from 'convex/react';
import { fetch } from 'expo/fetch';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';

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

export function useListening(): Listening {
  const recorder = useAudioRecorder(SPEECH);
  const startConversation = useMutation(api.conversations.start);
  const stopConversation = useMutation(api.conversations.stop);
  const generateUploadUrl = useMutation(api.conversations.generateUploadUrl);
  const addChunk = useMutation(api.conversations.addChunk);

  const [conversationId, setConversationId] = useState<Id<'conversations'> | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const rotating = useRef<Promise<void>>(Promise.resolve());

  const conversation = useQuery(api.conversations.get, conversationId ? { conversationId } : 'skip');

  const upload = useCallback(
    async (id: Id<'conversations'>, uri: string) => {
      const file = new File(uri);
      try {
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'audio/mp4' }, body: file });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
        await addChunk({ conversationId: id, storageId });
      } finally {
        if (file.exists) file.delete();
      }
    },
    [addChunk, generateUploadUrl],
  );

  const takeChunk = useCallback(
    async (id: Id<'conversations'>, again: boolean) => {
      await recorder.stop();
      const uri = recorder.uri;
      if (again) {
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
      if (uri) await upload(id, uri);
    },
    [recorder, upload],
  );

  const start = useCallback(async () => {
    if (isListening) return;
    setError(null);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setError('Jesse needs the microphone to listen');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    const id = await startConversation({});
    setConversationId(id);
    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsListening(true);
    timer.current = setInterval(() => {
      rotating.current = rotating.current
        .then(() => takeChunk(id, true))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, CHUNK_MS);
  }, [isListening, recorder, startConversation, takeChunk]);

  const stop = useCallback(async () => {
    if (!isListening || conversationId === null) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setIsListening(false);
    try {
      await rotating.current;
      await takeChunk(conversationId, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      await stopConversation({ conversationId });
      await setAudioModeAsync({ allowsRecording: false });
    }
  }, [conversationId, isListening, stopConversation, takeChunk]);

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
    status =
      names.length === 0
        ? 'Listening…'
        : `Listening · ${names.length + 1} people · ${names.join(', ')}?`;
  } else if (conversation?.status === 'processing') {
    status = 'Noting what mattered…';
  }

  return { isListening, status, start, stop };
}
