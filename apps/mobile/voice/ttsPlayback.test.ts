import { beforeEach, describe, expect, it, vi } from "vitest";
import { Pipeline } from "@edkimmel/expo-audio-stream";
import type { ServiceProfile } from "@my-brain/core";
import { createTtsPlayback } from "./ttsPlayback";
import { providerHttpStream, type HttpStream } from "../services/providerHttp";
vi.mock("../services/providerHttp", () => ({ providerHttpStream: vi.fn() }));
vi.mock("../services/secureCredentialStore", () => ({ getSecureCredentialStore: () => ({ get: async () => "fixture-key" }) }));
vi.mock("./doubaoPcmAudio", () => ({ ensureDoubaoAudioSession: async () => {} }));
const profile: ServiceProfile = { id: "speech", displayName: "Speech", role: "tts", adapterId: "openai-audio-speech", baseUrl: "https://example.com/v1", modelId: "selected-tts", voiceId: "selected-voice", credentialRef: "profile.speech", configRevision: 1, credentialRevision: 1 };
beforeEach(() => { vi.restoreAllMocks(); });
describe("TTS playback cancellation and completion", () => {
  it("uses configured model and waits for native playback completion", async () => {
    vi.mocked(providerHttpStream).mockResolvedValue({ status: 200, close() {}, chunks: (async function* () { yield Uint8Array.of(1); yield Uint8Array.of(2, 3, 4); })() });
    const push = vi.spyOn(Pipeline, "pushAudioSync");
    const playback = createTtsPlayback(profile);
    await playback.play("spoken text");
    const body = JSON.parse(vi.mocked(providerHttpStream).mock.calls[0]![1].body!);
    expect(body.model).toBe("selected-tts"); expect(body.voice).toBe("selected-voice");
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ audio: "AQIDBA==", isFirstChunk: true }));
    expect(playback.port.isPlaying()).toBe(false);
  });
  it("rejects cancellation and drops late audio rather than granting verification", async () => {
    let deliver!: (response: HttpStream) => void;
    vi.mocked(providerHttpStream).mockImplementation(() => new Promise((resolve) => { deliver = resolve; }));
    const push = vi.spyOn(Pipeline, "pushAudioSync");
    const playback = createTtsPlayback(profile);
    const result = playback.play("late response");
    await vi.waitFor(() => expect(deliver).toBeTypeOf("function"));
    playback.stop();
    deliver({ status: 200, close() {}, chunks: (async function* () { yield Uint8Array.of(1, 2); })() });
    await expect(result).rejects.toThrow("取消");
    expect(push).not.toHaveBeenCalled(); expect(playback.port.isPlaying()).toBe(false);
  });
  it("rejects permission failures without any queued audio", async () => {
    vi.mocked(providerHttpStream).mockResolvedValue({ status: 401, close() {}, chunks: (async function* () {})() });
    const push = vi.spyOn(Pipeline, "pushAudioSync");
    await expect(createTtsPlayback(profile).play("test")).rejects.toThrow("401");
    expect(push).not.toHaveBeenCalled();
  });
});
