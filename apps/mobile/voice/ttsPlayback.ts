import { Pipeline } from "@edkimmel/expo-audio-stream";
import { buildTtsRequest, PcmFramer, SseAudioDecoder, type ServiceProfile } from "@my-brain/core";
import { getSecureCredentialStore } from "../services/secureCredentialStore";
import { providerHttpStream } from "../services/providerHttp";
import { ensureDoubaoAudioSession } from "./doubaoPcmAudio";
import type { DeviceAudioIoPort } from "./deviceAudioClient";

function base64(bytes: Uint8Array): string {
  let raw = ""; for (const byte of bytes) raw += String.fromCharCode(byte); return btoa(raw);
}
export function createTtsPlayback(profile: ServiceProfile) {
  let controller: AbortController | null = null;
  let generation = 0;
  let playing = false;
  let turnId = "";
  let settle: (() => void) | null = null;
  const listeners = new Set<(playing: boolean) => void>();
  const errors = new Set<(message: string) => void>();
  const setPlaying = (value: boolean) => { playing = value; listeners.forEach((cb) => cb(value)); };
  const stop = () => {
    generation++; controller?.abort(); controller = null;
    if (turnId) void Pipeline.invalidateTurn({ turnId: `cancelled-${generation}` }).catch(() => undefined);
    settle?.(); settle = null; setPlaying(false);
  };
  const play = async (text: string): Promise<void> => {
    stop();
    const epoch = generation;
    const active = new AbortController(); controller = active;
    const id = `tts-${Date.now()}-${epoch}`; turnId = id;
    const request = buildTtsRequest(profile, text);
    const key = await getSecureCredentialStore().get(profile.credentialRef);
    if (!key) throw new Error("请先保存 TTS API Key");
    let subscription: { remove(): void } | undefined;
    let errorSubscription: { remove(): void } | undefined;
    let focusSubscription: { remove(): void } | undefined;
    let pipelineFailed = false;
    let lastChunkQueued = false;
    let first = true;
    let bytes = 0;
    const networkDeadline = setTimeout(() => active.abort(), 120_000);
    try {
      await ensureDoubaoAudioSession();
      if (epoch !== generation) throw new Error("语音播放已取消");
      await Pipeline.connect({ sampleRate: request.sampleRateHz, channelCount: 1, targetBufferMs: 80, audioMode: "duckOthers" });
      if (epoch !== generation) throw new Error("语音播放已取消");
      let completed!: () => void;
      const playbackEnded = new Promise<void>((resolve) => { completed = resolve; settle = resolve; });
      subscription = Pipeline.subscribe("PipelinePlaybackStopped", (event) => { if (lastChunkQueued && event.turnId === id && epoch === generation) completed(); });
      errorSubscription = Pipeline.onError(() => {
        if (epoch !== generation) return;
        pipelineFailed = true; active.abort(); completed();
      });
      focusSubscription = Pipeline.subscribe("PipelineAudioFocusLost", () => {
        if (epoch !== generation) return;
        stop(); errors.forEach((cb) => cb("系统音频中断，请恢复后重新连接语音"));
      });
      setPlaying(true);
      const response = await providerHttpStream(request.url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: request.body, signal: active.signal });
      if (response.status < 200 || response.status >= 300) { response.close(); throw new Error(`TTS 请求失败 (${response.status})`); }
      const sse = new SseAudioDecoder();
      const pcm = new PcmFramer();
      const push = async (part: Uint8Array) => {
        const framed = pcm.push(part);
        if (!framed.length || epoch !== generation) return;
        while (Pipeline.getTelemetry().bufferMs > 800 && epoch === generation && !active.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 20));
        if (epoch !== generation) throw new Error("语音播放已取消");
        if (active.signal.aborted) throw new Error("TTS 请求已取消或超时");
        if (!Pipeline.pushAudioSync({ audio: base64(framed), turnId: id, isFirstChunk: first })) throw new Error("音频播放队列不可用");
        first = false; bytes += framed.length;
      };
      for await (const chunk of response.chunks) {
        if (epoch !== generation) throw new Error("语音播放已取消");
        for (const part of request.streamingSse ? sse.push(chunk) : [chunk]) await push(part);
      }
      if (request.streamingSse) for (const part of sse.finish()) await push(part);
      pcm.finish();
      if (epoch !== generation) throw new Error("语音播放已取消");
      if (!bytes) throw new Error("服务未返回音频，请检查模型与音色");
      lastChunkQueued = true;
      if (!Pipeline.pushAudioSync({ audio: "", turnId: id, isLastChunk: true })) throw new Error("音频队列结束失败");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([playbackEnded, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("音频播放未完成")), 120_000); })]);
        if (epoch !== generation) throw new Error("语音播放已取消");
        if (pipelineFailed) throw new Error("设备音频播放失败");
      } finally { if (timer) clearTimeout(timer); }
    } catch (failure) {
      if (epoch === generation) {
        stop();
        const message = failure instanceof Error ? failure.message : "TTS 播放失败";
        errors.forEach((cb) => cb(message));
        throw failure;
      }
      throw new Error("语音播放已取消");
    } finally {
      subscription?.remove();
      clearTimeout(networkDeadline);
      errorSubscription?.remove();
      focusSubscription?.remove();
      if (epoch === generation) { controller = null; settle = null; setPlaying(false); }
    }
  };
  const port: DeviceAudioIoPort = {
    mode: "device_stub", enqueuePlayback() {}, speakText(text) { void play(text).catch(() => undefined); },
    interruptPlayback: stop, isPlaying: () => playing,
    onPlaybackStateChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    onError(cb) { errors.add(cb); return () => { errors.delete(cb); }; },
  };
  return { play, stop, port, async dispose() { stop(); await Pipeline.disconnect(); } };
}
