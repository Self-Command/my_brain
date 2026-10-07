/** Stub @edkimmel/expo-audio-stream for vitest (no native module in CI/node). */
export const Pipeline = class Pipeline {
  static readonly RECORDER = "recorder";
  static listeners = new Map<string, Set<(event: { turnId: string }) => void>>();
  static async connect() {}
  static async disconnect() {}
  static async invalidateTurn() {}
  static getTelemetry() { return { bufferMs: 0 }; }
  static getState() { return "idle"; }
  static onError() { return { remove() {} }; }
  static subscribe(name: string, cb: (event: { turnId: string }) => void) {
    const listeners = this.listeners.get(name) ?? new Set(); listeners.add(cb); this.listeners.set(name, listeners);
    return { remove: () => { listeners.delete(cb); } };
  }
  static pushAudioSync(options: { audio: string; turnId: string; isLastChunk?: boolean }) {
    if (options.isLastChunk) queueMicrotask(() => { this.listeners.get("PipelinePlaybackStopped")?.forEach((cb) => cb({ turnId: options.turnId })); });
    return true;
  }
};

export const ExpoPlayAudioStream = {
  async startMicrophone() {
    return { subscription: { remove: () => {} } };
  },
  async stopMicrophone() {},
  toggleSilence(_muted: boolean) {},
};
