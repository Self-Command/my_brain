import { afterEach, describe, expect, it, vi } from "vitest";
import { createVoiceSessionController } from "./VoiceSession";
import { createMemorySecureCredentialStore } from "../services/secureCredentialStore";
import { createMemorySecureTokenStore } from "./secureTokenStore";
import { startDeviceStt } from "./deviceSpeechInput";
import type { DeviceAudioIoPort } from "./deviceAudioClient";
vi.mock("./deviceSpeechInput", () => ({ startDeviceStt: vi.fn(async () => undefined), stopDeviceStt: vi.fn(async () => undefined) }));
afterEach(() => vi.clearAllMocks());
async function setup() {
  const credentials = createMemorySecureCredentialStore(); await credentials.set("voice_api_key", "fixture-tts-key");
  const audio: DeviceAudioIoPort = { mode: "device_stub", enqueuePlayback: vi.fn(), speakText: vi.fn(), interruptPlayback: vi.fn(), isPlaying: () => false, onPlaybackStateChange: () => () => undefined };
  return { credentials, audio, deps: { deviceId: "composed", voiceSettings: { providerId: "composed", voiceModel: "editable-tts", region: "" }, credentialStore: credentials, tokenStore: createMemorySecureTokenStore(), skipMicPermissionCheck: true, audioIo: audio } };
}
describe("composed voice runtime", () => {
  it("uses device recognition and selected LLM/TTS without opening a realtime socket", async () => {
    const { deps, audio } = await setup();
    const reply = vi.fn(async () => "所选 LLM 回复");
    const controller = createVoiceSessionController({ ...deps, onFreeformTranscript: reply });
    await controller.connect(); expect(startDeviceStt).toHaveBeenCalledTimes(1);
    controller.handleTranscript("介绍一下新的技术", 1);
    await Promise.resolve(); expect(reply).toHaveBeenCalledWith("介绍一下新的技术", expect.any(AbortSignal));
    expect(audio.speakText).toHaveBeenCalledWith("所选 LLM 回复"); controller.dispose();
  });
  it("cancels a pending reply and fences late model completions after interruption", async () => {
    const { deps, audio } = await setup(); let complete!: (text: string) => void;
    let signal!: AbortSignal;
    const controller = createVoiceSessionController({ ...deps, onFreeformTranscript: async (_text, activeSignal) => {
      signal = activeSignal; return new Promise<string>((resolve) => { complete = resolve; });
    } });
    await controller.connect(); controller.handleTranscript("说一个故事", 1);
    controller.bargeIn(); expect(signal.aborted).toBe(true);
    complete("迟到回复"); await Promise.resolve(); await Promise.resolve();
    expect(audio.speakText).not.toHaveBeenCalled(); expect(audio.interruptPlayback).toHaveBeenCalled(); controller.dispose();
  });
  it("keeps user confirmation on the original dispatcher and cancels on disconnect", async () => {
    const { deps, audio } = await setup(); let complete!: (text: string) => void;
    const dispatch = vi.fn(async () => new Promise<string>((resolve) => { complete = resolve; }));
    const freeform = vi.fn();
    const controller = createVoiceSessionController({ ...deps, isAwaitingConfirmation: () => true, onAsyncIntent: dispatch, onFreeformTranscript: freeform });
    await controller.connect(); expect(controller.handleTranscript("入", 1)).toBe("ingest");
    expect(dispatch).toHaveBeenCalledWith("ingest", expect.any(AbortSignal)); expect(freeform).not.toHaveBeenCalled();
    controller.disconnect(); complete("已确认"); await Promise.resolve(); await Promise.resolve();
    expect(audio.speakText).not.toHaveBeenCalled(); controller.dispose();
  });
  it("reports missing TTS credentials instead of falling back to mock transport", async () => {
    const { deps } = await setup(); await deps.credentialStore.delete("voice_api_key");
    const controller = createVoiceSessionController(deps);
    await expect(controller.connect()).rejects.toThrow("TTS 凭据"); controller.dispose();
  });
});
