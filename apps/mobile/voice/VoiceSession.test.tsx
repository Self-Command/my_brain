import { describe, expect, it, vi } from "vitest";

vi.mock("../env/readAppEnv", () => ({
  readMobileAppEnv: vi.fn(() => ({
    runtime: "mobile",
    providerModes: { voice: "mock", llm: "mock", newsRadar: "mock" },
  })),
}));

import { TokenExchangeError } from "@my-brain/core";

import { createMemorySecureCredentialStore } from "../services/secureCredentialStore";
import { createMemoryMicrophonePermissionPort } from "./microphonePermission";
import { createTestAudioInterruptMonitor } from "./platformAudioInterrupt";
import {
  createByokRealtimeVoiceTransport,
  type WebSocketConstructor,
  type WebSocketLike,
} from "./realtimeVoiceTransport";
import { createMemorySecureTokenStore, voiceTokenStorageKey } from "./secureTokenStore";
import { createTokenRefreshScheduler, msUntilTokenRefresh, shouldRefreshToken } from "./tokenRefresh";
import { createVoiceSessionController, derivePlaybackChunksFromReply, type VoiceSessionDeps } from "./VoiceSession";

const OPEN = 1;

function createMockWebSocketFactory(): {
  instances: Array<WebSocketLike & { url: string; protocols?: string | string[]; sent: string[] }>;
  WebSocket: WebSocketConstructor;
} {
  const instances: Array<WebSocketLike & { url: string; protocols?: string | string[]; sent: string[] }> =
    [];
  class MockWebSocket implements WebSocketLike {
    static readonly OPEN = OPEN;
    readyState = OPEN;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: ((event?: { code?: number }) => void) | null = null;

    constructor(
      public url: string,
      public protocols?: string | string[],
    ) {
      instances.push(this);
    }

    send(data: string): void {
      this.sent.push(data);
    }

    close(): void {
      this.readyState = 3;
      this.onclose?.();
    }
  }
  return { instances, WebSocket: MockWebSocket as unknown as WebSocketConstructor };
}

function testVoiceDeps(overrides: Partial<VoiceSessionDeps> = {}): VoiceSessionDeps {
  return {
    deviceId: "device-abc",
    voiceSettings: { providerId: "mock", voiceModel: "mock", region: "" },
    tokenStore: createMemorySecureTokenStore(),
    micPermission: createMemoryMicrophonePermissionPort("granted"),
    skipMicPermissionCheck: true,
    ...overrides,
  };
}

describe("VoiceSession FSM", () => {
  it("connects via mock transport without key and enters listening", async () => {
    const onClear = vi.fn();
    const ctrl = createVoiceSessionController(
      testVoiceDeps({
        credentialStore: createMemorySecureCredentialStore(),
        onClearDegradedVoice: onClear,
      }),
    );
    await ctrl.connect();
    expect(ctrl.getFsmState()).toBe("listening");
    expect(ctrl.getTransportKind()).toBe("mock");
    expect(onClear).toHaveBeenCalled();
  });

  it("maps voice transcript to ingest intent and enqueues mock playback", async () => {
    vi.useFakeTimers();
    const onIntent = vi.fn(() => "收到，准备点亮这颗星…");
    const ctrl = createVoiceSessionController(testVoiceDeps({ onIntent }));
    await ctrl.connect();
    const result = ctrl.handleTranscript("入", 1);
    expect(result).toBe("ingest");
    expect(onIntent).toHaveBeenCalledWith("ingest");
    expect(ctrl.getFsmState()).toBe("speaking");
    expect(ctrl.isTransportPlaying()).toBe(true);
    vi.useRealTimers();
  });

  it("handleTranscript delegates ingest via onIntent only — no graph writes in voice layer", async () => {
    const onIntent = vi.fn(() => "收到");
    const ctrl = createVoiceSessionController(testVoiceDeps({ onIntent }));
    await ctrl.connect();
    ctrl.handleTranscript("入", 1);
    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent).toHaveBeenCalledWith("ingest");
  });

  it("barge-in stops playback started by handleTranscript", async () => {
    vi.useFakeTimers();
    const onIntent = vi.fn(() => "收到，准备点亮这颗星…");
    const ctrl = createVoiceSessionController(testVoiceDeps({ onIntent }));
    await ctrl.connect();
    ctrl.handleTranscript("入", 1);
    expect(ctrl.isTransportPlaying()).toBe(true);
    ctrl.bargeIn();
    expect(ctrl.isTransportPlaying()).toBe(false);
    expect(ctrl.getFsmState()).toBe("listening");
    vi.useRealTimers();
  });

  it("barge-in stops mock playback and returns to listening", async () => {
    vi.useFakeTimers();
    const ctrl = createVoiceSessionController(testVoiceDeps());
    await ctrl.connect();
    ctrl.simulateAssistantSpeak(1, 10_000);
    expect(ctrl.isTransportPlaying()).toBe(true);
    expect(ctrl.getFsmState()).toBe("speaking");
    vi.advanceTimersByTime(5_000);
    expect(ctrl.isTransportPlaying()).toBe(true);
    expect(ctrl.getFsmState()).toBe("speaking");
    ctrl.bargeIn();
    expect(ctrl.isTransportPlaying()).toBe(false);
    expect(ctrl.getFsmState()).toBe("listening");
    vi.useRealTimers();
  });

  it("microphone permission denied sets error state", async () => {
    const onDegraded = vi.fn();
    const ctrl = createVoiceSessionController(
      testVoiceDeps({
        skipMicPermissionCheck: false,
        micPermission: createMemoryMicrophonePermissionPort("denied"),
        onDegradedVoice: onDegraded,
      }),
    );
    await expect(ctrl.connect()).rejects.toThrow(/permission denied/i);
    expect(ctrl.getFsmState()).toBe("error");
    expect(onDegraded).toHaveBeenCalledWith("permission");
  });

  it("BYOK path builds realtime connection via mock WebSocket transport", async () => {
    const factory = createMockWebSocketFactory();
    const credentialStore = createMemorySecureCredentialStore();
    await credentialStore.set("voice_api_key", "sk-voice-live");

    const ctrl = createVoiceSessionController(
      testVoiceDeps({
        credentialStore,
        voiceSettings: {
          providerId: "openai-realtime",
          voiceModel: "gpt-4o-realtime",
          region: "us-east",
        },
        transportOptions: { WebSocket: factory.WebSocket },
        voiceTransport: createByokRealtimeVoiceTransport({ WebSocket: factory.WebSocket }),
      }),
    );

    const connectPromise = ctrl.connect();
    await Promise.resolve();
    const ws = factory.instances[0]!;
    expect(ws.url).toContain("wss://api.openai.com/v1/realtime");
    expect(ws.protocols).toContain("openai-insecure-api-key.sk-voice-live");
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "session.updated" }) });
    await connectPromise;

    expect(ctrl.getFsmState()).toBe("listening");
    expect(ctrl.getTransportKind()).toBe("byok_live");
  });

  it("BYOK transport transcript frame invokes intent path and playback", async () => {
    vi.useFakeTimers();
    const factory = createMockWebSocketFactory();
    const credentialStore = createMemorySecureCredentialStore();
    await credentialStore.set("voice_api_key", "sk-voice-live");
    const onIntent = vi.fn(() => "好的，准备入库。");

    const ctrl = createVoiceSessionController(
      testVoiceDeps({
        credentialStore,
        voiceSettings: {
          providerId: "openai-realtime",
          voiceModel: "gpt-4o-realtime",
          region: "us-east",
        },
        transportOptions: { WebSocket: factory.WebSocket },
        voiceTransport: createByokRealtimeVoiceTransport({ WebSocket: factory.WebSocket }),
        onIntent,
      }),
    );

    const connectPromise = ctrl.connect();
    await Promise.resolve();
    const ws = factory.instances[0]!;
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: "session.updated" }) });
    await connectPromise;

    ws.onmessage?.({
      data: JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "入",
      }),
    });

    expect(onIntent).toHaveBeenCalledWith("ingest");
    expect(ctrl.getFsmState()).toBe("speaking");
    expect(ctrl.isTransportPlaying()).toBe(true);
    vi.useRealTimers();
  });

  it("token exchange failure sets error and degraded callback when Token BFF preferred", async () => {
    const onDegraded = vi.fn();
    const ctrl = createVoiceSessionController(
      testVoiceDeps({
        deviceId: "",
        preferTokenBff: true,
        onDegradedVoice: onDegraded,
        tokenClient: {
          exchange: async () => {
            throw new TokenExchangeError("deviceId required");
          },
        },
      }),
    );
    await expect(ctrl.connect()).rejects.toThrow(TokenExchangeError);
    expect(ctrl.getFsmState()).toBe("error");
    expect(onDegraded).toHaveBeenCalledWith("token_exchange");
  });

  it("transport error triggers degraded without graph side effects", async () => {
    const onDegraded = vi.fn();
    const ctrl = createVoiceSessionController(testVoiceDeps({ onDegradedVoice: onDegraded }));
    await ctrl.connect();
    ctrl.simulateTransportError();
    expect(ctrl.getFsmState()).toBe("error");
    expect(onDegraded).toHaveBeenCalledWith("transport");
  });

  it("audio focus loss pauses mock playback", async () => {
    vi.useFakeTimers();
    const audioInterrupt = createTestAudioInterruptMonitor(false);
    const ctrl = createVoiceSessionController(testVoiceDeps({ audioInterrupt }));
    await ctrl.connect();
    ctrl.simulateAssistantSpeak(1, 10_000);
    expect(ctrl.isTransportPlaying()).toBe(true);
    (audioInterrupt as ReturnType<typeof createTestAudioInterruptMonitor> & {
      simulatePause(next: boolean): void;
    }).simulatePause(true);
    expect(ctrl.isTransportPlaying()).toBe(false);
    vi.useRealTimers();
  });

  it("refreshes token before expiry when reconnecting with stale cache via Token BFF", async () => {
    vi.useFakeTimers();
    const exchange = vi.fn(async () => ({
      accessToken: "fresh-token",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      ttlSeconds: 900,
    }));
    const store = createMemorySecureTokenStore();
    await store.set(voiceTokenStorageKey(), {
      accessToken: "stale",
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    });
    const ctrl = createVoiceSessionController(
      testVoiceDeps({
        preferTokenBff: true,
        tokenStore: store,
        tokenClient: { exchange },
      }),
    );
    await ctrl.connect();
    expect(exchange).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("derivePlaybackChunksFromReply", () => {
  it("derives 1-3 chunks from reply length", () => {
    expect(derivePlaybackChunksFromReply("短")).toHaveLength(1);
    expect(derivePlaybackChunksFromReply("a".repeat(80))).toHaveLength(2);
    expect(derivePlaybackChunksFromReply("a".repeat(200))).toHaveLength(3);
  });
});

describe("token refresh helpers", () => {
  it("schedules refresh one minute before expiry", () => {
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    expect(msUntilTokenRefresh(expiresAt)).toBeGreaterThan(50_000);
    expect(shouldRefreshToken({ expiresAt: new Date(Date.now() + 120_000).toISOString() })).toBe(
      false,
    );
    expect(shouldRefreshToken({ expiresAt: new Date(Date.now() + 30_000).toISOString() })).toBe(
      true,
    );
  });

  it("runs refresh callback when scheduled", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => undefined);
    const scheduler = createTokenRefreshScheduler();
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    scheduler.schedule(expiresAt, refresh);
    vi.advanceTimersByTime(59_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    await Promise.resolve();
    expect(refresh).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
