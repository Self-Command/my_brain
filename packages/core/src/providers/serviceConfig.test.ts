import { describe, expect, it, vi } from "vitest";
import { createConfiguredLlmProvider, isProfileVerified, normalizeServiceBaseUrl, type ServiceProfile } from "./serviceConfig.js";
import { fetchModelCatalog, type CatalogFetch } from "./serviceCatalog.js";
import { buildTtsRequest, PcmFramer, SseAudioDecoder } from "./ttsProtocol.js";
import type { LlmFetch } from "./openAiCompatibleClient.js";
const profile: ServiceProfile = { id: "example", displayName: "Example", role: "llm", adapterId: "openai-chat-completions", baseUrl: "https://example.com/proxy/v1", modelId: "custom/model", credentialRef: "profile.example", configRevision: 1, credentialRevision: 1 };
describe("configured services", () => {
  it("keeps proxy prefixes and rejects insecure or credential-bearing addresses", () => {
    expect(normalizeServiceBaseUrl(" https://example.com/proxy/v1/ ")).toBe(profile.baseUrl);
    for (const url of ["http://example.com", "https://127.0.0.1", "https://user:password@example.com", "https://example.com?key=secret"]) expect(() => normalizeServiceBaseUrl(url)).toThrow();
  });
  it("submits the explicitly selected model and URL in actual explain requests", async () => {
    const fetch = vi.fn<LlmFetch>(async () => ({ ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { content: "解释" } }] }) }));
    await createConfiguredLlmProvider({ endpoint: profile.baseUrl, model: profile.modelId }, "fixture-key", fetch).explain("topic");
    expect(fetch.mock.calls[0]?.[0]).toBe(`${profile.baseUrl}/chat/completions`);
    expect(JSON.parse(fetch.mock.calls[0]![1]!.body!).model).toBe(profile.modelId);
    expect(() => createConfiguredLlmProvider({ endpoint: profile.baseUrl, model: "" }, "fixture-key", fetch)).toThrow();
  });
  it("invalidates readiness after config/key changes and expiry", () => {
    const records = [{ profileId: profile.id, configRevision: 1, credentialRevision: 1, live: true, verifiedAt: new Date().toISOString() }];
    expect(isProfileVerified(profile, records)).toBe(true);
    expect(isProfileVerified({ ...profile, credentialRevision: 2 }, records)).toBe(false);
    expect(isProfileVerified({ ...profile, configRevision: 2 }, records)).toBe(false);
    expect(isProfileVerified(profile, records, Date.now() + 90_000_000)).toBe(false);
  });
});
describe("model discovery", () => {
  it("deduplicates paginated IDs, preserves manual selection, and uses same-origin queries", async () => {
    const fetch: CatalogFetch = vi.fn(async (url) => ({ ok: true, status: 200, json: async () => url.endsWith("models") ? { data: [{ id: "a" }], next: "?page=2" } : { data: [{ id: "a" }, { id: "b", display_name: "B" }] } }));
    const result = await fetchModelCatalog(profile, "fixture-key", fetch, new AbortController().signal);
    expect(result.entries.map((item) => item.id)).toEqual(["a", "b"]);
    expect(profile.modelId).toBe("custom/model");
    expect(result.complete).toBe(true);
  });
  it("does not forward authorization to a cross-origin next URL", async () => {
    const fetch: CatalogFetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [], next: "https://other.example/models" }) }));
    await expect(fetchModelCatalog(profile, "fixture-key", fetch, new AbortController().signal)).rejects.toThrow("跨域");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reports permissions and absent catalogs without granting live readiness", async () => {
    for (const status of [401, 403, 404, 429]) {
      await expect(fetchModelCatalog(profile, "fixture-key", async () => ({ ok: false, status, json: async () => ({}) }), new AbortController().signal)).rejects.toThrow(String(status));
    }
  });
  it("reports incomplete pagination and respects cancellation", async () => {
    const result = await fetchModelCatalog(profile, "fixture-key", async () => ({ ok: true, status: 200, json: async () => ({ data: [], has_more: true }) }), new AbortController().signal);
    expect(result.complete).toBe(false);
    const controller = new AbortController(); controller.abort();
    await expect(fetchModelCatalog(profile, "fixture-key", vi.fn(), controller.signal)).rejects.toThrow("取消");
  });
});
describe("TTS protocol and stream framing", () => {
  const tts = { ...profile, role: "tts" as const, adapterId: "chat-completions-audio" as const, modelId: "editable-tts", voiceId: "白桦", style: "平静" };
  it("keeps MiMo model and voice configurable and never rewrites spoken text", () => {
    const request = buildTtsRequest(tts, "待播放原文");
    const body = JSON.parse(request.body);
    expect(body.model).toBe("editable-tts"); expect(body.audio.voice).toBe("白桦");
    expect(body.messages.at(-1)).toEqual({ role: "assistant", content: "待播放原文" });
    expect(() => buildTtsRequest({ ...tts, modelId: "mimo-v2.5-tts-voiceclone" }, "text")).toThrow();
  });
  it("parses multibyte UTF-8 and SSE split at every byte", () => {
    const decoder = new SseAudioDecoder();
    const bytes = new TextEncoder().encode('data: {"choices":[{"delta":{"audio":{"data":"AQIDBA=="},"text":"白桦"}}]}\r\n\r\ndata: [DONE]\n\n');
    const chunks = Array.from(bytes).flatMap((byte) => decoder.push(Uint8Array.of(byte)));
    chunks.push(...decoder.finish());
    expect(chunks).toEqual([Uint8Array.of(1, 2, 3, 4)]);
  });
  it("rejects invalid audio and frames odd chunk boundaries without losing samples", () => {
    const decoder = new SseAudioDecoder();
    expect(() => decoder.push(new TextEncoder().encode('data: {"choices":[{"delta":{"audio":{"data":"!invalid"}}}]}\n\n'))).toThrow();
    const pcm = new PcmFramer(); expect(pcm.push(Uint8Array.of(1))).toHaveLength(0);
    expect(pcm.push(Uint8Array.of(2, 3, 4))).toEqual(Uint8Array.of(1, 2, 3, 4)); pcm.finish();
    pcm.push(Uint8Array.of(1)); expect(() => pcm.finish()).toThrow();
  });
});
