import { useAction } from 'convex/react';
import {
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioPlayer,
} from 'expo-audio';
import { File } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { useState } from 'react';
import { Platform } from 'react-native';

import { api } from '../../convex/_generated/api';
import { convex } from '@/lib/convex';

let player: AudioPlayer | null = null;

export async function stopSpeaking() {
  player?.remove();
  player = null;
  await Speech.stop();
}

export async function speak(text: string) {
  await stopSpeaking();
  try {
    const { url } = await convex.action(api.jesse.speak, { text });
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    const current = createAudioPlayer(url);
    player = current;
    current.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish && player === current) {
        void stopSpeaking();
      }
    });
    current.play();
  } catch {
    Speech.speak(text, { rate: 0.95, pitch: 1.0 });
  }
}

export function useVoiceInput() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const transcribe = useAction(api.jesse.transcribe);
  const [recording, setRecording] = useState(false);

  const start = async () => {
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      throw new Error('Jesse needs the microphone to hear you.');
    }
    await stopSpeaking();
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };

  const stop = async () => {
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri) {
      return '';
    }
    if (Platform.OS === 'web') {
      const audio = await (await fetch(uri)).arrayBuffer();
      return (await transcribe({ audio, mimeType: 'audio/webm' })).text;
    }
    const file = new File(uri);
    try {
      return (await transcribe({ audio: await file.arrayBuffer(), mimeType: 'audio/m4a' })).text;
    } finally {
      file.delete();
    }
  };

  return { recording, start, stop };
}
