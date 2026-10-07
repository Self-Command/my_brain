import { afterEach, describe, expect, it, vi } from "vitest";
import Voice from "@react-native-voice/voice";
import { startDeviceStt, stopDeviceStt } from "./deviceSpeechInput";
afterEach(async () => { await stopDeviceStt(); vi.restoreAllMocks(); });
describe("device recognition boundaries", () => {
  it("waits for final results before starting the next recognition round", async () => {
    const start = vi.spyOn(Voice, "start"); const transcript = vi.fn();
    await startDeviceStt(transcript);
    Voice.onSpeechEnd?.({});
    await Promise.resolve();
    expect(start).toHaveBeenCalledTimes(1);
    Voice.onSpeechResults?.({ value: ["final text"] });
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(transcript).toHaveBeenCalledWith("final text");
  });
  it("uses partial activity only for interruption and dispatches final transcription once", async () => {
    const transcript = vi.fn(); const activity = vi.fn();
    await startDeviceStt(transcript, activity);
    Voice.onSpeechPartialResults?.({ value: ["入"] });
    expect(activity).toHaveBeenCalledWith("入"); expect(transcript).not.toHaveBeenCalled();
    const final = Voice.onSpeechResults;
    final?.({ value: ["入"] }); expect(transcript).toHaveBeenCalledTimes(1);
    await stopDeviceStt(); final?.({ value: ["迟到文本"] }); expect(transcript).toHaveBeenCalledTimes(1);
  });
  it("finishes native cleanup when disconnect races with recognizer startup", async () => {
    let release!: () => void;
    const start = vi.spyOn(Voice, "start").mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const destroy = vi.spyOn(Voice, "destroy");
    const pending = startDeviceStt(vi.fn());
    await vi.waitFor(() => expect(start).toHaveBeenCalled());
    const stopped = stopDeviceStt(); release();
    await expect(pending).rejects.toThrow("取消"); await stopped;
    expect(destroy).toHaveBeenCalled();
  });
});
