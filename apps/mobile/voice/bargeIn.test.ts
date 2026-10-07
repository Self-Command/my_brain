import { describe, expect, it, vi } from "vitest";

vi.mock("../env/readAppEnv", () => ({
  readMobileAppEnv: vi.fn(() => ({
    runtime: "mobile",
    providerModes: { voice: "mock", llm: "mock", newsRadar: "mock" },
  })),
}));

import { createVoiceSessionController } from "./VoiceSession";
import { createMemoryMicrophonePermissionPort } from "./microphonePermission";
import { createMemorySecureTokenStore } from "./secureTokenStore";
import { createMockRealtimePlaybackQueue } from "./mockRealtimeTransport";

function testDeps() {
  return {
    deviceId: "barge-in-test",
    voiceSettings: { providerId: "mock", voiceModel: "mock", region: "" },
    tokenStore: createMemorySecureTokenStore(),
    micPermission: createMemoryMicrophonePermissionPort("granted"),
    skipMicPermissionCheck: true,
  };
}

describe("bargeIn mock transport", () => {
  it("stops playback immediately and records mock latency metric", () => {
    vi.useFakeTimers();
    const transport = createMockRealtimePlaybackQueue();
    const startedAt = performance.now();
    transport.enqueueChunks([{ id: "long", durationMs: 10_000 }]);
    expect(transport.isPlaying()).toBe(true);
    transport.interrupt();
    const stopPlaybackMs = Math.round(performance.now() - startedAt);
    expect(transport.isPlaying()).toBe(false);
    expect(transport.getQueuedCount()).toBe(0);
    expect(stopPlaybackMs).toBeLessThan(300);
    vi.useRealTimers();
  });

  it("speaking + user barge-in → interrupted then listening via VoiceSession", async () => {
    vi.useFakeTimers();
    const ctrl = createVoiceSessionController(testDeps());
    await ctrl.connect();
    ctrl.simulateAssistantSpeak(1, 10_000);
    expect(ctrl.getFsmState()).toBe("speaking");
    expect(ctrl.isTransportPlaying()).toBe(true);
    const startedAt = performance.now();
    ctrl.bargeIn();
    const stopPlaybackMs = Math.round(performance.now() - startedAt);
    expect(ctrl.isTransportPlaying()).toBe(false);
    expect(ctrl.getFsmState()).toBe("listening");
    expect(stopPlaybackMs).toBeLessThan(300);
    vi.useRealTimers();
  });
});
