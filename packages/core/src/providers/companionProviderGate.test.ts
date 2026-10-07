import { describe, expect, it } from "vitest";

import {
  COMPANION_ENV_KEYS,
  companionEnvConfigured,
  readCompanionEnvFromRecord,
} from "./companionEnvKeys.js";
import {
  buildDoubaoConnectHeaders,
  doubaoCredentialsConfigured,
  testDoubaoVoiceConnection,
  type DoubaoWebSocketLike,
} from "./doubaoVoiceConnectionTest.js";
import { createModelScopeLlmProvider, DEFAULT_MODELSCOPE_BASE_URL } from "./modelscopeLlmProvider.js";
import { VOLC_SERVER_EVENT } from "./volcDoubaoConstants.js";

describe("companionEnvKeys", () => {
  it("reads companion env snapshot without exposing values in API", () => {
    const snapshot = readCompanionEnvFromRecord({
      [COMPANION_ENV_KEYS.doubaoVoiceAppId]: "5997830090",
      [COMPANION_ENV_KEYS.doubaoVoiceAccessToken]: "token",
      [COMPANION_ENV_KEYS.doubaoVoiceSecretKey]: "secret",
      [COMPANION_ENV_KEYS.modelscopeLlmApiKey]: "ms-key",
    });
    expect(companionEnvConfigured(snapshot)).toBe(true);
    expect(snapshot.doubaoVoiceAppId).toBe("5997830090");
    expect(snapshot.modelscopeLlmBaseUrl).toBe(DEFAULT_MODELSCOPE_BASE_URL);
  });
});

describe("modelscopeLlmProvider", () => {
  it("testConnection maps success to connected", async () => {
    const llm = createModelScopeLlmProvider({
      apiKey: "ms-key",
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: "pong" } }] }),
        json: async () => ({ choices: [{ message: { content: "pong" } }] }),
      }),
    });
    await expect(llm.testConnection()).resolves.toEqual({ status: "connected" });
  });
});

describe("doubaoVoiceConnectionTest", () => {
  it("requires configured credentials", async () => {
    const result = await testDoubaoVoiceConnection({ appId: "", accessToken: "" });
    expect(result.status).toBe("error");
    expect("errorCode" in result && result.errorCode).toBe("MISSING_API_KEY");
  });

  it("requires injectable WebSocket for live handshake", async () => {
    const result = await testDoubaoVoiceConnection({
      appId: "app-id",
      accessToken: "access-token",
    });
    expect(result.status).toBe("error");
    expect("errorCode" in result && result.errorCode).toBe("NATIVE_TRANSPORT_REQUIRED");
  });

  it("maps connectionStarted frame to connected", async () => {
    class MockWs implements DoubaoWebSocketLike {
      readyState = 0;
      binaryType = "arraybuffer";
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(
        _url: string,
        _protocols?: string | string[],
        public options?: { headers?: Record<string, string> },
      ) {
        queueMicrotask(() => {
          this.onopen?.();
          const header = new Uint8Array(4);
          header[0] = (1 << 4) | 1;
          header[1] = (9 << 4) | 4;
          header[2] = 1 << 4;
          header[3] = 0;
          const eventId = new Uint8Array(4);
          new DataView(eventId.buffer).setUint32(0, VOLC_SERVER_EVENT.connectionStarted, false);
          const frame = new Uint8Array(8);
          frame.set(header, 0);
          frame.set(eventId, 4);
          this.onmessage?.({ data: frame.buffer });
        });
      }

      send(): void {}
      close(): void {}
    }

    const result = await testDoubaoVoiceConnection(
      { appId: "app-id", accessToken: "access-token" },
      { WebSocket: MockWs as unknown as typeof MockWs },
    );
    expect(result.status).toBe("connected");
    expect(buildDoubaoConnectHeaders({ appId: "app-id", accessToken: "access-token" })).toMatchObject({
      "X-Api-App-ID": "app-id",
      "X-Api-Access-Key": "access-token",
    });
  });

  it("doubaoCredentialsConfigured checks both fields", () => {
    expect(doubaoCredentialsConfigured({ appId: "a", accessToken: "" })).toBe(false);
    expect(doubaoCredentialsConfigured({ appId: "a", accessToken: "b" })).toBe(true);
  });
});
