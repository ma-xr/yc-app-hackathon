import { useState } from 'react';

// Stub owned by the Pipeline thread (YCAP-8); replace with the real capture hook, same shape.
export type Listening = {
  isListening: boolean;
  status: string | null;
  start: () => void | Promise<void>;
  stop: () => void | Promise<void>;
};

export function useListening(): Listening {
  const [isListening, setListening] = useState(false);
  return {
    isListening,
    status: isListening ? 'Listening · 2 people · Sam?' : null,
    start: () => setListening(true),
    stop: () => setListening(false),
  };
}
