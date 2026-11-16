export type CaptureState = 'off' | 'listening' | 'paused' | 'unavailable';

const noop = async () => {};

export function usePassiveCapture(): {
  state: CaptureState;
  paused: boolean;
  setPaused(p: boolean): void;
  holdForTalk(): Promise<void>;
  releaseAfterTalk(): Promise<void>;
} {
  return { state: 'off', paused: false, setPaused: () => {}, holdForTalk: noop, releaseAfterTalk: noop };
}
