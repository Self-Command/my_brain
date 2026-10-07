import type { MockRealtimeTransport, PlaybackChunk } from "./mockRealtimeTransport";
import { createMockRealtimePlaybackQueue } from "./mockRealtimeTransport";
import {
  isDeviceSpeechPlaying,
  onDeviceSpeechStateChange,
  speakDeviceText,
  stopDeviceSpeech,
} from "./deviceSpeechOutput";
export type DeviceAudioIoMode = "mock" | "device_stub";

export interface DeviceAudioIoPort {
  mode: DeviceAudioIoMode;
  enqueuePlayback(chunks: PlaybackChunk[]): void;
  /** Speaks assistant reply on device speaker — used in device_stub mode. */
  speakText?(text: string): void;
  interruptPlayback(): void;
  isPlaying(): boolean;
  onPlaybackStateChange(cb: (playing: boolean) => void): () => void;
  onError?(cb: (message: string) => void): () => void;
}

function createMockAudioIoPort(mode: DeviceAudioIoMode): DeviceAudioIoPort {
  const transport: MockRealtimeTransport = createMockRealtimePlaybackQueue();
  return {
    mode,
    enqueuePlayback(chunks) {
      transport.enqueueChunks(chunks);
    },
    interruptPlayback() {
      transport.interrupt();
    },
    isPlaying: () => transport.isPlaying(),
    onPlaybackStateChange: (cb) => transport.onStateChange(cb),
  };
}

function createDeviceStubAudioIoPort(): DeviceAudioIoPort {
  return {
    mode: "device_stub",
    enqueuePlayback() {
      // Timed chunks are mock-only; device_stub speaks via speakText().
    },
    speakText(text) {
      void speakDeviceText(text);
    },
    interruptPlayback() {
      stopDeviceSpeech();
    },
    isPlaying: () => isDeviceSpeechPlaying(),
    onPlaybackStateChange: (cb) => onDeviceSpeechStateChange(cb),
  };
}
/**
 * Device audio I/O — mock queue for tests; device_stub uses expo-speech TTS (no raw audio persisted).
 */
export function createDeviceAudioIoPort(mode: DeviceAudioIoMode = "mock"): DeviceAudioIoPort {
  if (mode === "device_stub") {
    return createDeviceStubAudioIoPort();
  }
  return createMockAudioIoPort(mode);
}
