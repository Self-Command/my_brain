import { useCallback, useRef, useSyncExternalStore } from "react";

import {
  RealtimeVoiceTransportError,
  TokenExchangeError,
  resolveDoubaoDialogModel,
  resolveVoiceTranscript,
  type UserIntent,
} from "@my-brain/core";

import { readMobileAppEnv } from "../env/readAppEnv";
import { loadProviderSettings, type VoiceProviderConfig } from "../services/providerConfigStore";
import {
  getSecureCredentialStore,
  type SecureCredentialStore,
} from "../services/secureCredentialStore";
import { createDeviceAudioIoPort, type DeviceAudioIoPort } from "./deviceAudioClient";
import { createDoubaoRealtimeVoiceTransport } from "./doubaoRealtimeTransport";
import { startDeviceStt, stopDeviceStt } from "./deviceSpeechInput";
import type { PlaybackChunk } from "./mockRealtimeTransport";
import {
  createDeviceMicrophonePermissionPort,
  type MicrophonePermissionPort,
} from "./microphonePermission";
import {
  createPlatformAudioInterruptMonitor,
  type AudioInterruptMonitor,
} from "./platformAudioInterrupt";
import {
  buildRealtimeConnectionRequest,
  createByokRealtimeVoiceTransport,
  createMockRealtimeVoiceTransport,
  type RealtimeTransportFactoryOptions,
  type VoiceRealtimeTransport,
} from "./realtimeVoiceTransport";
import {
  createExpoSecureTokenStore,
  voiceTokenStorageKey,
  type SecureTokenStore,
} from "./secureTokenStore";
import {
  createTokenRefreshScheduler,
  refreshVoiceToken,
  shouldRefreshToken,
  type TokenRefreshScheduler,
} from "./tokenRefresh";
import {
  createTokenExchangeClient,
  type TokenExchangeClient,
  type TokenExchangeClientOptions,
} from "./tokenExchangeClient";
import {
  createInitialVoiceSnapshot,
  reduceVoiceFsm,
  type VoiceFsmState,
  type VoiceSessionSnapshot,
} from "./VoiceSessionFsm";
import {
  resolveVoiceTransportKind,
  type VoiceTransportKind,
} from "./voiceTransportBoundary";

export interface VoiceSessionDeps {
  deviceId: string;
  platformOs?: "android" | "ios";
  credentialStore?: SecureCredentialStore;
  voiceSettings?: VoiceProviderConfig;
  voiceTransport?: VoiceRealtimeTransport;
  transportOptions?: RealtimeTransportFactoryOptions;
  /** When true, uses Token BFF path if no BYOK key is configured. */
  preferTokenBff?: boolean;
  tokenClient?: TokenExchangeClient;
  tokenStore?: SecureTokenStore;
  tokenOptions?: TokenExchangeClientOptions;
  audioIo?: DeviceAudioIoPort;
  micPermission?: MicrophonePermissionPort;
  audioInterrupt?: AudioInterruptMonitor;
  tokenRefreshScheduler?: TokenRefreshScheduler;
  skipMicPermissionCheck?: boolean;
  onIntent?: (intent: UserIntent) => string | void;
  onAsyncIntent?: (intent: UserIntent, signal: AbortSignal) => Promise<string | void>;
  onFreeformTranscript?: (text: string, signal: AbortSignal) => Promise<string>;
  isAwaitingConfirmation?: () => boolean;
  onDegradedVoice?: (reason: "token_exchange" | "transport" | "permission" | "offline") => void;
  onClearDegradedVoice?: () => void;
}

/** Derive mock TTS chunk schedule from assistant reply length — no raw audio persisted. */
export function derivePlaybackChunksFromReply(reply: string): PlaybackChunk[] {
  const len = reply.trim().length;
  const chunkCount = len <= 40 ? 1 : len <= 120 ? 2 : 3;
  const totalMs = Math.min(3_000, Math.max(120, Math.round(len * 25)));
  const perChunk = Math.max(40, Math.round(totalMs / chunkCount));
  return Array.from({ length: chunkCount }, (_, i) => ({
    id: `reply-${i}`,
    durationMs: perChunk,
  }));
}

export interface VoiceSessionController {
  getSnapshot: () => VoiceSessionSnapshot;
  subscribe: (cb: () => void) => () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  handleTranscript: (transcript: string, attempt: 1 | 2) => UserIntent | "reprompt" | null;
  simulateAssistantSpeak: (chunkCount?: number, durationMsPerChunk?: number) => void;
  bargeIn: () => void;
  getFsmState: () => VoiceFsmState;
  isTransportPlaying: () => boolean;
  simulateTransportError: () => void;
  getTransportKind: () => VoiceTransportKind;
}

function resolveDefaultTokenClient(options?: TokenExchangeClientOptions): TokenExchangeClient {
  if (options) {
    return createTokenExchangeClient(options);
  }
  const env = readMobileAppEnv();
  if (env.tokenExchangeUrl) {
    return createTokenExchangeClient({ mode: "staging", stagingUrl: env.tokenExchangeUrl });
  }
  return createTokenExchangeClient({ mode: "mock" });
}

function resolveDefaultTokenStore(explicit?: SecureTokenStore): SecureTokenStore {
  return explicit ?? createExpoSecureTokenStore();
}

function resolveDefaultCredentialStore(explicit?: SecureCredentialStore): SecureCredentialStore {
  return explicit ?? getSecureCredentialStore();
}

function resolveVoiceSettings(deps: VoiceSessionDeps): VoiceProviderConfig {
  return deps.voiceSettings ?? loadProviderSettings().voice;
}

export function createVoiceSessionController(deps: VoiceSessionDeps): VoiceSessionController {
  const composed = resolveVoiceSettings(deps).providerId === "composed";
  let replyAbort: AbortController | null = null;
  let replyEpoch = 0;
  let lastAssistantText = "";
  let speakStartedMs = 0;
  const cancelReply = () => { replyEpoch++; replyAbort?.abort(); replyAbort = null; };
  let snapshot = createInitialVoiceSnapshot();
  let connected = false;
  let activeTransport: VoiceRealtimeTransport | null = null;
  let hasVoiceKey = false;
  let ingestAttempt: 1 | 2 = 1;
  let transportTranscriptUnsub: (() => void) | undefined;
  let transportPlaybackUnsub: (() => void) | undefined;
  let deviceSttActive = false;
  let usesDeviceStt = false;
  let usesDoubaoS2S = false;
  let lastTranscriptText = "";
  let lastTranscriptAtMs = 0;

  const startDeviceListening = async () => {
    if (deviceSttActive) {
      return;
    }
    deviceSttActive = true;
    await startDeviceStt((transcript) => {
      handleTranscriptInternal(transcript);
    }, (partial) => {
      if (!composed || !playback.isPlaying()) return;
      if (partial && lastAssistantText.includes(partial.trim())) return;
      if (!partial && Date.now() - speakStartedMs < 150) return;
      cancelReply(); playback.interruptPlayback();
      applyEvent({ type: "barge_in" }); applyEvent({ type: "start_listening" }); notify();
    });
  };

  const stopDeviceListening = async () => {
    if (!deviceSttActive) {
      return;
    }
    deviceSttActive = false;
    await stopDeviceStt();
  };

  const playback = deps.audioIo ?? createDeviceAudioIoPort("mock");
  const tokenClient = deps.tokenClient ?? resolveDefaultTokenClient(deps.tokenOptions);
  const tokenStore = resolveDefaultTokenStore(deps.tokenStore);
  const credentialStore = resolveDefaultCredentialStore(deps.credentialStore);
  const micPermission = deps.micPermission ?? createDeviceMicrophonePermissionPort();
  const audioInterrupt =
    deps.audioInterrupt ?? createPlatformAudioInterruptMonitor(deps.platformOs ?? "android");
  const tokenRefreshScheduler = deps.tokenRefreshScheduler ?? createTokenRefreshScheduler();
  const listeners = new Set<() => void>();

  const notify = () => listeners.forEach((l) => l());
  const applyEvent = (event: Parameters<typeof reduceVoiceFsm>[1]) => {
    snapshot = reduceVoiceFsm(snapshot, event);
  };

  const pausePlaybackIfNeeded = () => {
    if (audioInterrupt.shouldPauseTts() && playback.isPlaying()) {
      playback.interruptPlayback();
      if (snapshot.state === "speaking") {
        applyEvent({ type: "barge_in" });
        applyEvent({ type: "start_listening" });
        notify();
      }
    }
  };

  playback.onPlaybackStateChange((playing) => {
    if (playing) {
      if (!composed) void stopDeviceListening();
      return;
    }
    if (snapshot.state === "speaking") {
      applyEvent({ type: "assistant_reply_end" });
      notify();
    }
    if (connected && usesDeviceStt && !deviceSttActive) {
      void startDeviceListening();
    }
  });

  audioInterrupt.subscribe(() => {
    if (composed && audioInterrupt.shouldPauseTts()) { cancelReply(); playback.interruptPlayback(); }
    pausePlaybackIfNeeded();
  });
  playback.onError?.((message) => { cancelReply(); applyEvent({ type: "transport_error", message }); deps.onDegradedVoice?.("transport"); notify(); });

  const enqueueAssistantReply = (reply: string) => {
    if (audioInterrupt.shouldPauseTts()) {
      return;
    }
    const trimmed = reply.trim();
    if (!trimmed) {
      return;
    }
    applyEvent({ type: "assistant_reply_start" });
    lastAssistantText = trimmed; speakStartedMs = Date.now();
    if (!composed) void stopDeviceListening();
    if (playback.speakText) {
      playback.speakText(trimmed);
    } else {
      playback.enqueuePlayback(derivePlaybackChunksFromReply(trimmed));
    }
    notify();
  };

  const wireTransportTranscripts = () => {
    transportTranscriptUnsub?.();
    transportTranscriptUnsub = undefined;
    transportPlaybackUnsub?.();
    transportPlaybackUnsub = undefined;
    if (!activeTransport) {
      return;
    }
    if (usesDoubaoS2S) {
      transportTranscriptUnsub = activeTransport.onTranscript((transcript) => {
        if (!connected) {
          return;
        }
        const trimmed = transcript.trim();
        if (!trimmed) {
          return;
        }
        if (deps.isAwaitingConfirmation?.() && resolveVoiceTranscript(trimmed, 1).kind === "intent") {
          const resolved = resolveVoiceTranscript(trimmed, 1);
          if (resolved.kind === "intent") deps.onIntent?.(resolved.intent);
        }
        applyEvent({ type: "user_utterance_end" });
        notify();
      });
      transportPlaybackUnsub = activeTransport.onPlaybackStateChange?.((playing) => {
        if (playing) {
          applyEvent({ type: "assistant_reply_start" });
        } else if (snapshot.state === "speaking" || snapshot.state === "thinking") {
          applyEvent({ type: "assistant_reply_end" });
          applyEvent({ type: "start_listening" });
        }
        notify();
      });
      return;
    }
    transportTranscriptUnsub = activeTransport.onTranscript((transcript) => {
      handleTranscriptInternal(transcript);
    });
  };

  const handleTranscriptInternal = (transcript: string, attempt?: 1 | 2) => {
    if (!connected) {
      deps.onDegradedVoice?.("offline");
      return null;
    }
    if (snapshot.state === "speaking" || playback.isPlaying()) {
      if (!composed || lastAssistantText.includes(transcript.trim())) return null;
      cancelReply(); playback.interruptPlayback();
      applyEvent({ type: "barge_in" }); applyEvent({ type: "start_listening" });
    }
    const trimmed = transcript.trim();
    if (!trimmed) {
      return null;
    }
    const nowMs = Date.now();
    if (trimmed === lastTranscriptText && nowMs - lastTranscriptAtMs < 2_500) {
      return null;
    }
    lastTranscriptText = trimmed;
    lastTranscriptAtMs = nowMs;
    applyEvent({ type: "user_utterance_end" });
    const resolved = resolveVoiceTranscript(transcript, attempt ?? ingestAttempt);
    if (composed && (resolved.kind === "reprompt" || !deps.isAwaitingConfirmation?.()) && deps.onFreeformTranscript) {
      if (!deps.isAwaitingConfirmation?.() && resolved.kind === "intent" && resolved.intent === "explain_more") {
        // Known commands still use the existing intent dispatcher below.
      } else if (!deps.isAwaitingConfirmation?.()) {
        cancelReply(); const epoch = replyEpoch; const controller = new AbortController(); replyAbort = controller;
        void deps.onFreeformTranscript(trimmed, controller.signal).then((reply) => {
          if (connected && epoch === replyEpoch && !controller.signal.aborted) enqueueAssistantReply(reply);
        }).catch(() => { if (connected && epoch === replyEpoch) { applyEvent({ type: "transport_error", message: "语言模型回复失败，请检查连接" }); notify(); } });
        notify(); return null;
      }
    }
    if (resolved.kind === "reprompt") {
      ingestAttempt = 2;
      applyEvent({ type: "start_listening" });
      notify();
      return "reprompt";
    }
    ingestAttempt = 1;
    if (composed && deps.onAsyncIntent) {
      cancelReply(); const epoch = replyEpoch; const controller = new AbortController(); replyAbort = controller;
      void deps.onAsyncIntent(resolved.intent, controller.signal).then((reply) => {
        if (connected && epoch === replyEpoch && !controller.signal.aborted && typeof reply === "string") enqueueAssistantReply(reply);
      }).catch(() => { if (epoch === replyEpoch) { applyEvent({ type: "transport_error", message: "回复失败" }); notify(); } });
      notify(); return resolved.intent;
    }
    const assistantReply = deps.onIntent?.(resolved.intent);
    if (typeof assistantReply === "string" && assistantReply.trim()) {
      enqueueAssistantReply(assistantReply);
    } else {
      applyEvent({ type: "assistant_reply_start" });
      notify();
    }
    return resolved.intent;
  };

  const storeTokenAndScheduleRefresh = async () => {
    const token = await refreshVoiceToken(deps.deviceId, tokenClient);
    await tokenStore.set(voiceTokenStorageKey(), {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    });
    tokenRefreshScheduler.schedule(token.expiresAt, async () => {
      try {
        if (composed) {
          if (!hasVoiceKey) throw new Error("TTS 凭据未配置");
          connected = true; usesDeviceStt = true; usesDoubaoS2S = false;
          await startDeviceListening(); applyEvent({ type: "start_listening" }); deps.onClearDegradedVoice?.(); notify(); return;
        }
        await storeTokenAndScheduleRefresh();
        deps.onClearDegradedVoice?.();
      } catch {
        connected = false;
        applyEvent({ type: "transport_error", message: "token refresh failed" });
        deps.onDegradedVoice?.("token_exchange");
        notify();
      }
    });
    return token;
  };

  const connectMockTransport = async () => {
    const transport = deps.voiceTransport ?? createMockRealtimeVoiceTransport();
    await transport.connect({
      url: "mock://voice",
      protocols: [],
      providerId: "mock",
      model: "mock-voice",
    });
    activeTransport = transport;
    connected = true;
    ingestAttempt = 1;
    wireTransportTranscripts();
    applyEvent({ type: "start_listening" });
    deps.onClearDegradedVoice?.();
    notify();
  };

  const connectByokTransport = async (apiKey: string) => {
    const settings = resolveVoiceSettings(deps);
    const transport =
      deps.voiceTransport?.kind === "byok_live"
        ? deps.voiceTransport
        : createByokRealtimeVoiceTransport(deps.transportOptions);
    const request = buildRealtimeConnectionRequest(settings, apiKey);
    await transport.connect(request);
    activeTransport = transport;
    connected = true;
    ingestAttempt = 1;
    wireTransportTranscripts();
    applyEvent({ type: "start_listening" });
    deps.onClearDegradedVoice?.();
    notify();
  };

  const connectDoubaoTransport = async (accessToken: string) => {
    const settings = resolveVoiceSettings(deps);
    const appId = settings.appId?.trim();
    if (!appId) {
      throw new RealtimeVoiceTransportError("Doubao App ID required for live voice");
    }
    const transport =
      deps.voiceTransport?.kind === "byok_live"
        ? deps.voiceTransport
        : createDoubaoRealtimeVoiceTransport(
            { appId, accessToken: accessToken.trim() },
            {
              DoubaoWebSocket: deps.transportOptions?.DoubaoWebSocket,
              dialogModel: resolveDoubaoDialogModel(settings.voiceModel),
            },
          );
    await transport.connect({
      url: "wss://doubao-volc",
      protocols: [],
      providerId: settings.providerId,
      model: settings.voiceModel.trim() || "doubao-realtime",
    });
    activeTransport = transport;
    connected = true;
    usesDeviceStt = false;
    usesDoubaoS2S = true;
    ingestAttempt = 1;
    wireTransportTranscripts();
    applyEvent({ type: "start_listening" });
    deps.onClearDegradedVoice?.();
    notify();
  };

  const connectTokenBff = async () => {
    const cached = await tokenStore.get(voiceTokenStorageKey());
    if (shouldRefreshToken(cached)) {
      await storeTokenAndScheduleRefresh();
    } else if (cached) {
      tokenRefreshScheduler.schedule(cached.expiresAt, async () => {
        try {
          await storeTokenAndScheduleRefresh();
          deps.onClearDegradedVoice?.();
        } catch {
          connected = false;
          applyEvent({ type: "transport_error", message: "token refresh failed" });
          deps.onDegradedVoice?.("token_exchange");
          notify();
        }
      });
    }
    connected = true;
    ingestAttempt = 1;
    applyEvent({ type: "start_listening" });
    deps.onClearDegradedVoice?.();
    notify();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getFsmState: () => snapshot.state,
    isTransportPlaying: () => playback.isPlaying(),
    getTransportKind: () => {
      const settings = resolveVoiceSettings(deps);
      return resolveVoiceTransportKind(hasVoiceKey, settings.providerId, connected);
    },
    async connect() {
      if (!deps.skipMicPermissionCheck) {
        const micStatus = await micPermission.request();
        if (micStatus === "denied") {
          connected = false;
          applyEvent({ type: "transport_error", message: "microphone permission denied" });
          deps.onDegradedVoice?.("permission");
          notify();
          throw new RealtimeVoiceTransportError("microphone permission denied");
        }
      }

      const voiceSettings = resolveVoiceSettings(deps);
      const apiKey = await credentialStore.get("voice_api_key");
      hasVoiceKey = Boolean(apiKey?.trim());
      const isDoubaoProvider =
        voiceSettings.providerId === "doubao-volc" ||
        voiceSettings.providerId === "volc-realtime";
      const hasByok =
        voiceSettings.providerId !== "mock" &&
        hasVoiceKey &&
        (!isDoubaoProvider || Boolean(voiceSettings.appId?.trim()));
      const env = readMobileAppEnv();
      const useTokenBff =
        deps.preferTokenBff === true ||
        (deps.preferTokenBff !== false && !hasByok && Boolean(env.tokenExchangeUrl));

      try {
        if (hasByok) {
          if (isDoubaoProvider) {
            await connectDoubaoTransport(apiKey!.trim());
          } else {
            await connectByokTransport(apiKey!.trim());
          }
          return;
        }

        if (useTokenBff) {
          await connectTokenBff();
          return;
        }

        await connectMockTransport();
      } catch (e) {
        connected = false;
        activeTransport?.disconnect();
        activeTransport = null;
        tokenRefreshScheduler.clear();
        const message =
          e instanceof TokenExchangeError
            ? e.message
            : e instanceof RealtimeVoiceTransportError
              ? e.message
              : e instanceof Error
                ? e.message
                : "voice transport failed";
        applyEvent({ type: "transport_error", message });
        deps.onDegradedVoice?.(
          e instanceof TokenExchangeError ? "token_exchange" : "transport",
        );
        notify();
        throw e;
      }
    },
    disconnect() {
      cancelReply();
      connected = false;
      hasVoiceKey = false;
      usesDeviceStt = false;
      usesDoubaoS2S = false;
      ingestAttempt = 1;
      transportTranscriptUnsub?.();
      transportTranscriptUnsub = undefined;
      transportPlaybackUnsub?.();
      transportPlaybackUnsub = undefined;
      void stopDeviceListening();
      tokenRefreshScheduler.clear();
      activeTransport?.disconnect();
      activeTransport = null;
      playback.interruptPlayback();
      applyEvent({ type: "reset" });
      notify();
    },
    handleTranscript(transcript: string, attempt: 1 | 2) {
      return handleTranscriptInternal(transcript, attempt);
    },
    simulateAssistantSpeak(chunkCount = 2, durationMsPerChunk = 40) {
      if (!connected) {
        return;
      }
      if (audioInterrupt.shouldPauseTts()) {
        return;
      }
      applyEvent({ type: "assistant_reply_start" });
      playback.enqueuePlayback(
        Array.from({ length: chunkCount }, (_, i) => ({
          id: `chunk-${i}`,
          durationMs: durationMsPerChunk,
        })),
      );
      notify();
    },
    bargeIn() {
      if (snapshot.state !== "speaking") {
        return;
      }
      cancelReply(); activeTransport?.bargeInPlayback?.();
      playback.interruptPlayback();
      applyEvent({ type: "barge_in" });
      applyEvent({ type: "start_listening" });
      notify();
    },
    simulateTransportError() {
      playback.interruptPlayback();
      connected = false;
      activeTransport?.disconnect();
      activeTransport = null;
      tokenRefreshScheduler.clear();
      applyEvent({
        type: "transport_error",
        message: new RealtimeVoiceTransportError("mock transport disconnect").message,
      });
      deps.onDegradedVoice?.("transport");
      notify();
    },
  };
}

let sharedController: VoiceSessionController | null = null;

export function getVoiceSessionSingleton(deps: VoiceSessionDeps): VoiceSessionController {
  if (!sharedController) {
    sharedController = createVoiceSessionController(deps);
  }
  return sharedController;
}

export function resetVoiceSessionSingleton(): void {
  sharedController = null;
}

export function useVoiceSession(deps: VoiceSessionDeps) {
  const controllerRef = useRef(getVoiceSessionSingleton(deps));
  controllerRef.current = getVoiceSessionSingleton(deps);

  const subscribe = useCallback(
    (cb: () => void) => controllerRef.current.subscribe(cb),
    [deps],
  );
  const getSnapshot = useCallback(() => controllerRef.current.getSnapshot(), [deps]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const controller = controllerRef.current;

  return {
    state: snapshot.state,
    lastError: snapshot.lastError,
    connect: controller.connect,
    disconnect: controller.disconnect,
    handleTranscript: controller.handleTranscript,
    simulateAssistantSpeak: controller.simulateAssistantSpeak,
    bargeIn: controller.bargeIn,
    simulateTransportError: controller.simulateTransportError,
    isPlaying: controller.isTransportPlaying,
    transportKind: controller.getTransportKind(),
  };
}
