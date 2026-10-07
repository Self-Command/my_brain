import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROVIDER_SETTINGS,
  deriveProviderSnapshotFromSettings,
  evaluateProviderGateResults,
  testDoubaoVoiceConnectionFromSettings,
  testExecutionApiConnection,
  testLlmConnection,
  testRadarConnection,
  testTokenExchangeConnection,
  testVoiceConnection,
  verifyCompanionProviderGate,
  type LlmConnectionFetch,
} from "./providerConfigStore";
import type { DoubaoWebSocketConstructor, DoubaoWebSocketLike } from "@my-brain/core";
import type { WebSocketConstructor, WebSocketLike } from "../voice/realtimeVoiceTransport";
import { validateProviderHttpsUrl } from "./providerUrlValidation";

function mockLlmFetch(
  handler: () => {
    ok: boolean;
    status: number;
    body?: unknown;
    text?: string;
  },
): LlmConnectionFetch {
  return async () => {
    const response = handler();
    const textBody =
      response.text ??
      (response.body === undefined ? "" : JSON.stringify(response.body));
    return {
      ok: response.ok,
      status: response.status,
      text: async () => textBody,
      json: async () =>
        response.body ??
        (textBody ? (JSON.parse(textBody) as unknown) : ({} as unknown)),
    };
  };
}

describe("providerUrlValidation (S14)", () => {
  it("rejects non-https URLs", () => {
    const result = validateProviderHttpsUrl("http://api.example.com/token");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("HTTPS_REQUIRED");
  });

  it("rejects localhost and private IPs", () => {
    expect(validateProviderHttpsUrl("https://localhost/token").ok).toBe(false);
    expect(validateProviderHttpsUrl("https://127.0.0.1/token").ok).toBe(false);
    expect(validateProviderHttpsUrl("https://192.168.1.1/token").ok).toBe(false);
    expect(validateProviderHttpsUrl("https://10.0.0.5/token").ok).toBe(false);
  });

  it("rejects file and javascript schemes", () => {
    expect(validateProviderHttpsUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateProviderHttpsUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("accepts public https URLs", () => {
    expect(validateProviderHttpsUrl("https://staging.example.com/token").ok).toBe(true);
  });
});

describe("provider connection tests (LIVE-02)", () => {
  it("provider snapshot treats saved but untested LLM key as degraded, not live", () => {
    const snapshot = deriveProviderSnapshotFromSettings(
      DEFAULT_PROVIDER_SETTINGS,
      true,
      false,
      true,
    );
    expect(snapshot.llm).toBe("degraded");
    expect(snapshot.llm).not.toBe("live");
    expect(snapshot.lastErrorCode).toBe("ProviderConnectionUntested");
  });

  it("provider snapshot never marks voice connected before LIVE-06 transport test", () => {
    const snapshot = deriveProviderSnapshotFromSettings(
      {
        ...DEFAULT_PROVIDER_SETTINGS,
        voice: {
          providerId: "openai-realtime",
          voiceModel: "gpt-4o-realtime",
          region: "us-east",
        },
      },
      false,
      true,
      false,
    );
    expect(snapshot.voice).toBe("disconnected");
    expect(snapshot.voice).not.toBe("connected");
  });

  it("provider snapshot does not mark radar live before runtime fetch", () => {
    const snapshot = deriveProviderSnapshotFromSettings(
      {
        ...DEFAULT_PROVIDER_SETTINGS,
        radar: { enabledSources: ["github"], fetchIntervalMinutes: 60 },
      },
      false,
      false,
      true,
    );
    expect(snapshot.radar).toBe("degraded");
    expect(snapshot.radar).not.toBe("live");
    expect(snapshot.lastErrorCode).toBe("RadarRuntimeCheckRequired");
  });

  it("LLM without key returns mock — not live", async () => {
    const result = await testLlmConnection(DEFAULT_PROVIDER_SETTINGS.llm, { hasKey: false });
    expect(result.status).toBe("mock");
    expect(result.hint).toMatch(/演示/);
  });

  it("LLM with key but missing endpoint on openai-compatible returns error", async () => {
    const result = await testLlmConnection(
      { providerId: "openai", model: "gpt-4o-mini", endpoint: "" },
      { hasKey: true, apiKey: "sk-test" },
    );
    expect(result.status).toBe("error");
    expect(result.code).toBe("ProviderConfigError");
  });

  it("LLM with key uses core testConnection and maps success to live", async () => {
    const fetch = mockLlmFetch(() => ({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: "pong" } }] },
    }));
    const result = await testLlmConnection(DEFAULT_PROVIDER_SETTINGS.llm, {
      hasKey: true,
      apiKey: "sk-live",
      fetch,
    });
    expect(result.status).toBe("live");
    expect(result.hint).toMatch(/已连接/);
  });

  it("LLM 401 maps to error — not live", async () => {
    const fetch = mockLlmFetch(() => ({
      ok: false,
      status: 401,
      body: { error: { message: "invalid key" } },
    }));
    const result = await testLlmConnection(DEFAULT_PROVIDER_SETTINGS.llm, {
      hasKey: true,
      apiKey: "sk-bad",
      fetch,
    });
    expect(result.status).toBe("error");
    expect(result.code).toBe("UNAUTHORIZED");
  });

  it("LLM 429 maps to degraded — not live", async () => {
    const fetch = mockLlmFetch(() => ({
      ok: false,
      status: 429,
      body: { error: { message: "rate limited" } },
    }));
    const result = await testLlmConnection(DEFAULT_PROVIDER_SETTINGS.llm, {
      hasKey: true,
      apiKey: "sk-live",
      fetch,
    });
    expect(result.status).toBe("degraded");
    expect(result.code).toBe("RATE_LIMITED");
  });

  it("LLM 5xx maps to degraded — not live", async () => {
    const fetch = mockLlmFetch(() => ({
      ok: false,
      status: 503,
      body: { error: { message: "unavailable" } },
    }));
    const result = await testLlmConnection(DEFAULT_PROVIDER_SETTINGS.llm, {
      hasKey: true,
      apiKey: "sk-live",
      fetch,
    });
    expect(result.status).toBe("degraded");
    expect(result.code).toBe("SERVER_ERROR");
  });

  it("LLM network failure maps to error — not live", async () => {
    const fetch: LlmConnectionFetch = async () => {
      throw new Error("network down");
    };
    const result = await testLlmConnection(DEFAULT_PROVIDER_SETTINGS.llm, {
      hasKey: true,
      apiKey: "sk-live",
      fetch,
    });
    expect(result.status).toBe("error");
    expect(result.code).toBe("NETWORK_ERROR");
  });

  it("voice with key uses transport test — live only after mock WS handshake", async () => {
    class MockWs implements WebSocketLike {
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror = null;
      onclose = null;
      constructor() {
        queueMicrotask(() => {
          this.onopen?.();
          this.onmessage?.({ data: JSON.stringify({ type: "session.updated" }) });
        });
      }
      send(): void {
        // no-op
      }
      close(): void {
        // no-op
      }
    }

    const result = await testVoiceConnection(
      { providerId: "openai-realtime", voiceModel: "gpt-4o-realtime", region: "us-east" },
      true,
      false,
      { apiKey: "sk-live", WebSocket: MockWs as unknown as WebSocketConstructor },
    );
    expect(result.status).toBe("live");
    expect(result.hint).toMatch(/已连接/);
  });

  it("voice without key returns mock — not live", async () => {
    const result = await testVoiceConnection(
      { providerId: "openai-realtime", voiceModel: "gpt-4o-realtime", region: "us-east" },
      false,
      false,
    );
    expect(result.status).toBe("mock");
    expect(result.hint).toMatch(/演示/);
  });

  it("radar configured source waits for runtime fetch before showing live", () => {
    const result = testRadarConnection({ enabledSources: ["github"], fetchIntervalMinutes: 60 });
    expect(result.status).toBe("degraded");
    expect(result.code).toBe("RadarRuntimeCheckRequired");
    expect(result.hint).toMatch(/刷新/);
  });

  it("token exchange without URL says BYOK does not require BFF", () => {
    const result = testTokenExchangeConnection({
      baseUrl: "",
      deviceIdStrategy: "auto",
    });
    expect(result.status).toBe("mock");
    expect(result.code).toBe("TokenExchangeNotRequired");
    expect(result.hint).toMatch(/BYOK/);
  });

  it("token exchange invalid URL returns error code", () => {
    const result = testTokenExchangeConnection({
      baseUrl: "http://bad.example/token",
      deviceIdStrategy: "auto",
    });
    expect(result.status).toBe("error");
    expect(result.code).toBe("HTTPS_REQUIRED");
  });

  it("execution API defaults to disabled mock", () => {
    const result = testExecutionApiConnection(DEFAULT_PROVIDER_SETTINGS.executionApi);
    expect(result.status).toBe("mock");
    expect(result.code).toBe("ExecutionApiDisabled");
  });

  it("execution API enabled with valid https passes config test only", () => {
    const result = testExecutionApiConnection({
      baseUrl: "https://exec.example.com/v1",
      enabled: true,
    });
    expect(result.status).toBe("degraded");
    expect(result.code).toBe("ExecutionApiHealthCheckPending");
    expect(result.hint).toMatch(/不执行远端写/);
  });
});

function buildDoubaoStartedFrame(): ArrayBuffer {
  const header = new Uint8Array(4);
  header[0] = (1 << 4) | 1;
  header[1] = (9 << 4) | 4;
  header[2] = 1 << 4;
  header[3] = 0;
  const eventId = new Uint8Array(4);
  new DataView(eventId.buffer).setUint32(0, 50, false);
  const frame = new Uint8Array(8);
  frame.set(header, 0);
  frame.set(eventId, 4);
  return frame.buffer;
}

class MockDoubaoWs implements DoubaoWebSocketLike {
  readyState = 0;
  binaryType = "arraybuffer";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor() {
    queueMicrotask(() => {
      this.onopen?.();
      this.onmessage?.({ data: buildDoubaoStartedFrame() });
    });
  }

  send(): void {}
  close(): void {}
}

describe("CK-04 companion provider gate", () => {
  it("evaluateProviderGateResults enables text when LLM is live and keeps voice separate", () => {
    expect(
      evaluateProviderGateResults(
        { status: "live", hint: "ok" },
        { status: "error", code: "UNAUTHORIZED", hint: "bad key" },
      ).verified,
    ).toBe(true);
    expect(
      evaluateProviderGateResults(
        { status: "live", hint: "ok" },
        { status: "live", hint: "ok" },
      ).verified,
    ).toBe(true);
  });

  it("fresh install without keys returns mock — gate stays blocked", async () => {
    const gate = await verifyCompanionProviderGate({
      settings: DEFAULT_PROVIDER_SETTINGS,
      llmHasKey: false,
      llmApiKey: null,
      voiceHasKey: false,
      voiceApiKey: null,
    });
    expect(gate.llm.status).toBe("mock");
    expect(gate.voice.status).toBe("mock");
    expect(gate.verification.verified).toBe(false);
  });

  it("LLM success with voice failure permits text and leaves voice disabled", async () => {
    const fetch = mockLlmFetch(() => ({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: "pong" } }] },
    }));
    const gate = await verifyCompanionProviderGate(
      {
        settings: DEFAULT_PROVIDER_SETTINGS,
        llmHasKey: true,
        llmApiKey: "ms-key",
        voiceHasKey: false,
        voiceApiKey: null,
      },
      { llmFetch: fetch },
    );
    expect(gate.llm.status).toBe("live");
    expect(gate.voice.status).toBe("mock");
    expect(gate.verification.verified).toBe(true);
  });

  it("both ModelScope and Doubao mocked live enables gate", async () => {
    const fetch = mockLlmFetch(() => ({
      ok: true,
      status: 200,
      body: { choices: [{ message: { content: "pong" } }] },
    }));
    const gate = await verifyCompanionProviderGate(
      {
        settings: {
          ...DEFAULT_PROVIDER_SETTINGS,
          voice: { ...DEFAULT_PROVIDER_SETTINGS.voice, appId: "app-id" },
        },
        llmHasKey: true,
        llmApiKey: "ms-key",
        voiceHasKey: true,
        voiceApiKey: "voice-token",
      },
      {
        llmFetch: fetch,
        doubaoWebSocket: MockDoubaoWs as unknown as DoubaoWebSocketConstructor,
      },
    );
    expect(gate.llm.status).toBe("live");
    expect(gate.voice.status).toBe("live");
    expect(gate.verification.verified).toBe(true);
  });

  it("bad ModelScope key maps to error — gate blocked", async () => {
    const fetch = mockLlmFetch(() => ({
      ok: false,
      status: 401,
      body: { error: { message: "invalid key" } },
    }));
    const gate = await verifyCompanionProviderGate(
      {
        settings: DEFAULT_PROVIDER_SETTINGS,
        llmHasKey: true,
        llmApiKey: "bad-key",
        voiceHasKey: true,
        voiceApiKey: "voice-token",
      },
      {
        llmFetch: fetch,
        doubaoWebSocket: MockDoubaoWs as unknown as DoubaoWebSocketConstructor,
      },
    );
    expect(gate.llm.status).toBe("error");
    expect(gate.verification.verified).toBe(false);
  });

  it("testDoubaoVoiceConnectionFromSettings without app id stays mock", async () => {
    const result = await testDoubaoVoiceConnectionFromSettings(
      DEFAULT_PROVIDER_SETTINGS.voice,
      true,
      "token",
    );
    expect(result.status).toBe("mock");
  });
});
