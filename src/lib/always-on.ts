import { useAction, useMutation } from 'convex/react';
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
import { useIsSpeaking } from '@/lib/voice';
import { addressedTo, endsWithName, heardWake } from '@/lib/wake';

export type JesseMode = 'off' | 'waiting' | 'capturing';

const CHUNK_MS = 6_000;
const QUIET_CHUNKS_TO_END = 8;
const MIME = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';

const SPEECH: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
};

function discard(uri: string) {
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

export function useAlwaysOnJesse(onAddressed: (question: string) => void) {
  const recorder = useAudioRecorder(SPEECH);
  const transcribe = useAction(api.jesse.transcribe);
  const processChunk = useAction(api.extract.processChunk);
  const startConversation = useMutation(api.conversations.start);
  const stopConversation = useMutation(api.conversations.stop);
  const speaking = useIsSpeaking();

  const [mode, setMode] = useState<JesseMode>('off');
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const paused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const conversation = useRef<Id<'conversations'> | null>(null);
  const quiet = useRef(0);
  const extracting = useRef(new Set<Promise<unknown>>());
  const carry = useRef('');
  const onAddressedRef = useRef(onAddressed);
  const rollRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    onAddressedRef.current = onAddressed;
  }, [onAddressed]);

  const schedule = useCallback(() => {
    timer.current = setTimeout(() => void rollRef.current(), CHUNK_MS);
  }, []);

  const endCapture = useCallback(async () => {
    const id = conversation.current;
    conversation.current = null;
    carry.current = '';
    if (running.current) setMode('waiting');
    await Promise.all(extracting.current);
    if (id) await stopConversation({ conversationId: id }).catch(() => {});
  }, [stopConversation]);

  const handle = useCallback(
    async (uri: string) => {
      try {
        const audio = await read(uri);
        if (audio.byteLength < 2000) return;
        const { text } = await transcribe({ audio, mimeType: MIME });
        if (!running.current) return;
        const heard = text.trim();
        if (!heard) {
          if (conversation.current && ++quiet.current >= QUIET_CHUNKS_TO_END) await endCapture();
          return;
        }
        quiet.current = 0;
        const joined = `${carry.current} ${heard}`.trim();
        const question = addressedTo(joined);
        if (!conversation.current && (question || heardWake(joined))) {
          const id = await startConversation({});
          if (!running.current) {
            await stopConversation({ conversationId: id }).catch(() => {});
            return;
          }
          conversation.current = id;
          setMode('capturing');
        }
        if (conversation.current) {
          const sent = processChunk({ conversationId: conversation.current, audio }).catch(() => {});
          extracting.current.add(sent);
          void sent.finally(() => extracting.current.delete(sent));
        }
        carry.current = question ? '' : endsWithName(heard) ? heard : '';
        if (question) onAddressedRef.current(question);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        discard(uri);
      }
    },
    [endCapture, processChunk, startConversation, stopConversation, transcribe],
  );

  const record = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder]);

  const roll = useCallback(async () => {
    timer.current = null;
    if (!running.current || paused.current) return;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (running.current && !paused.current) await record();
      if (uri) queue.current = queue.current.then(() => handle(uri));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    if (running.current && !paused.current) schedule();
  }, [handle, record, recorder, schedule]);

  useEffect(() => {
    rollRef.current = roll;
  }, [roll]);

  const start = useCallback(async () => {
    if (running.current) return;
    setError(null);
    const { granted } = await requestRecordingPermissionsAsync().catch(() => ({ granted: false }));
    if (!granted) {
      setError('Jesse needs the microphone to listen');
      return;
    }
    try {
      running.current = true;
      paused.current = false;
      quiet.current = 0;
      await record();
      setMode('waiting');
      schedule();
    } catch (e) {
      running.current = false;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [record, schedule]);

  const stop = useCallback(async () => {
    if (!running.current) return;
    running.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setMode('off');
    try {
      await recorder.stop();
      if (recorder.uri) discard(recorder.uri);
    } catch {}
    await queue.current;
    await endCapture();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
  }, [endCapture, recorder]);

  useEffect(() => {
    if (!running.current) return;
    if (speaking) {
      paused.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      void (async () => {
        try {
          await recorder.stop();
          if (recorder.uri) discard(recorder.uri);
        } catch {}
      })();
      return;
    }
    if (!paused.current) return;
    paused.current = false;
    void record()
      .then(schedule)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [speaking, record, recorder, schedule]);

  useEffect(
    () => () => {
      running.current = false;
      if (timer.current) clearTimeout(timer.current);
      void recorder.stop().catch(() => {});
      const id = conversation.current;
      if (id) void stopConversation({ conversationId: id }).catch(() => {});
    },
    [recorder, stopConversation],
  );

  return { mode, error, start, stop };
}
