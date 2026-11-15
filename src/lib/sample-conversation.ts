import { useAction, useMutation } from 'convex/react';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Platform } from 'react-native';

import { api } from '../../convex/_generated/api';

const SAMPLE = require('../../assets/audio/sample-conversation.m4a');

async function sampleBytes() {
  const asset = await Asset.fromModule(SAMPLE).downloadAsync();
  if (Platform.OS === 'web') {
    return await (await fetch(asset.uri)).arrayBuffer();
  }
  return await new File(asset.localUri ?? asset.uri).arrayBuffer();
}

export function useSampleConversation() {
  const startConversation = useMutation(api.conversations.start);
  const stopConversation = useMutation(api.conversations.stop);
  const processChunk = useAction(api.extract.processChunk);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async (): Promise<string | null> => {
    if (running) return null;
    setRunning(true);
    setStatus('Jesse is listening to a sample conversation…');
    try {
      const audio = await sampleBytes();
      const conversationId = await startConversation({});
      try {
        await processChunk({ conversationId, audio });
      } finally {
        await stopConversation({ conversationId });
      }
      return 'Done. Here’s what Jesse caught from the sample.';
    } catch {
      return 'Jesse couldn’t listen to the sample just now. Try again in a moment.';
    } finally {
      setStatus(null);
      setRunning(false);
    }
  };

  return { run, running, status };
}
