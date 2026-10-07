import {
  RealtimeVoiceTransportError,
  VOLC_REALTIME_WS_URL,
  VOLC_SERVER_EVENT,
  buildDoubaoConnectHeaders,
  buildDoubaoDialogSessionPayload,
  encodeDoubaoFinishConnection,
  encodeDoubaoFinishSession,
  encodeDoubaoSayHello,
  encodeDoubaoStartConnection,
  encodeDoubaoStartSessionFrame,
  encodeDoubaoTaskRequest,
  extractAsrText,
  parseDoubaoDialogFrame,
  resolveDoubaoDialogModel,
  type DoubaoVoiceCredentials,
  type DoubaoWebSocketConstructor,
} from "@my-brain/core";

import {
  connectDoubaoPlaybackPipeline,
  invalidateDoubaoPlaybackTurn,
  muteDoubaoMic,
  pushDoubaoTtsChunk,
  startDoubaoMicCapture,
  teardownDoubaoAudio,
  type DoubaoMicSession,
} from "./doubaoPcmAudio";
import type { RealtimeConnectionRequest, VoiceRealtimeTransport } from "./realtimeVoiceTransport";

export interface DoubaoTransportFactoryOptions {
  DoubaoWebSocket?: DoubaoWebSocketConstructor;
  connectTimeoutMs?: number;
  /** Volc dialog model, e.g. `2.2.0.0` — required for server-side TTS. */
  dialogModel?: string;
}

function resolveDoubaoWebSocket(
  override?: DoubaoWebSocketConstructor,
): DoubaoWebSocketConstructor | undefined {
  if (override) {
    return override;
  }
  const candidate = globalThis.WebSocket as unknown as DoubaoWebSocketConstructor | undefined;
  return typeof candidate === "function" ? candidate : undefined;
}

function randomSessionId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function coerceMessageToArrayBuffer(data: unknown): Promise<ArrayBuffer | null> {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.arrayBuffer();
  }
  return null;
}

function logDoubaoEvent(eventId: number | undefined, detail?: string): void {
  if (!__DEV__ || eventId == null) {
    return;
  }
  console.log("[doubao-voice] server event", eventId, detail ?? "");
}

/** Full-duplex Doubao realtime dialog — server ASR + TTS over Volc WebSocket. */
export function createDoubaoDialogVoiceTransport(
  credentials: DoubaoVoiceCredentials,
  options: DoubaoTransportFactoryOptions = {},
): VoiceRealtimeTransport {
  let ws: InstanceType<DoubaoWebSocketConstructor> | null = null;
  let connected = false;
  let dialogModel = resolveDoubaoDialogModel(options.dialogModel);
  let sessionId: string | null = null;
  let micSession: DoubaoMicSession | null = null;
  let assistantTurnId = "turn-0";
  let ttsChunkIndex = 0;
  let assistantSpeaking = false;
  let audioReady = false;
  let sessionActive = false;
  let onAudioReady: (() => void) | null = null;
  let onAudioReadyFailed: ((message: string) => void) | null = null;
  let pendingAsrText = "";

  const transcriptListeners = new Set<(transcript: string) => void>();
  const playbackListeners = new Set<(playing: boolean) => void>();

  const notifyPlayback = (playing: boolean) => {
    if (assistantSpeaking === playing) {
      return;
    }
    assistantSpeaking = playing;
    playbackListeners.forEach((listener) => listener(playing));
  };

  const sendFrame = (frame: Uint8Array) => {
    const payload = frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength);
    ws?.send(payload);
  };

  const beginAssistantTurn = () => {
    assistantTurnId = `turn-${Date.now()}`;
    ttsChunkIndex = 0;
    notifyPlayback(true);
  };

  const endAssistantTurn = () => {
    if (ttsChunkIndex > 0) {
      pushDoubaoTtsChunk(new Uint8Array(0), assistantTurnId, { isLastChunk: true });
    }
    notifyPlayback(false);
    ttsChunkIndex = 0;
    muteDoubaoMic(false);
  };

  const handleServerFrame = (data: ArrayBuffer) => {
    const frame = parseDoubaoDialogFrame(data);
    if (frame.errorCode != null) {
      const message = `Doubao server error ${frame.errorCode}`;
      if (__DEV__) {
        console.warn("[doubao-voice]", message);
      }
      if (onAudioReadyFailed && !audioReady) {
        onAudioReadyFailed(message);
      }
      return;
    }

    logDoubaoEvent(frame.eventId);

    switch (frame.eventId) {
      case VOLC_SERVER_EVENT.connectionStarted:
        sessionId = randomSessionId();
        sendFrame(
          encodeDoubaoStartSessionFrame(
            sessionId,
            buildDoubaoDialogSessionPayload(dialogModel),
          ),
        );
        return;
      case VOLC_SERVER_EVENT.sessionStarted:
        sessionActive = true;
        void (async () => {
          try {
            await connectDoubaoPlaybackPipeline();
            micSession = await startDoubaoMicCapture((pcm) => {
              if (!sessionId || !sessionActive) {
                return;
              }
              sendFrame(encodeDoubaoTaskRequest(sessionId, pcm));
            });
            if (sessionId) {
              sendFrame(encodeDoubaoSayHello(sessionId, "你好，我在听。"));
            }
            audioReady = true;
            onAudioReady?.();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Doubao audio pipeline failed";
            if (__DEV__) {
              console.warn("[doubao-voice] audio setup failed", message);
            }
            onAudioReadyFailed?.(message);
          }
        })();
        return;
      case VOLC_SERVER_EVENT.asrResponse: {
        const text = extractAsrText(frame.payloadJson);
        if (text) pendingAsrText = text;
        return;
      }
      case VOLC_SERVER_EVENT.asrEnded: {
        const final = extractAsrText(frame.payloadJson) || pendingAsrText;
        pendingAsrText = "";
        if (final) transcriptListeners.forEach((listener) => listener(final));
        return;
      }
      case VOLC_SERVER_EVENT.chatResponse:
        if (__DEV__ && frame.payloadJson) {
          console.log("[doubao-voice] chat", JSON.stringify(frame.payloadJson).slice(0, 200));
        }
        return;
      case VOLC_SERVER_EVENT.ttsSentenceStart:
        if (ttsChunkIndex === 0) {
          beginAssistantTurn();
          muteDoubaoMic(true);
        }
        return;
      case VOLC_SERVER_EVENT.ttsResponse:
        if (frame.audio && frame.audio.length > 0) {
          if (ttsChunkIndex === 0 && !assistantSpeaking) {
            beginAssistantTurn();
            muteDoubaoMic(true);
          }
          if (__DEV__) {
            console.log("[doubao-voice] tts chunk", frame.audio.length, "bytes");
          }
          pushDoubaoTtsChunk(frame.audio, assistantTurnId, {
            isFirstChunk: ttsChunkIndex === 0,
          });
          ttsChunkIndex += 1;
        }
        return;
      case VOLC_SERVER_EVENT.ttsEnded:
        endAssistantTurn();
        return;
      case VOLC_SERVER_EVENT.connectionFailed:
        connected = false;
        return;
      default:
        return;
    }
  };

  const teardown = async () => {
    connected = false;
    sessionActive = false;
    audioReady = false;
    pendingAsrText = "";
    onAudioReady = null;
    onAudioReadyFailed = null;
    notifyPlayback(false);
    if (micSession) {
      await micSession.stop();
      micSession = null;
    }
    await teardownDoubaoAudio();
    if (sessionId && ws) {
      sendFrame(encodeDoubaoFinishSession(sessionId));
      sessionId = null;
    }
    try {
      sendFrame(encodeDoubaoFinishConnection());
    } catch {
      // socket may already be closed
    }
    ws?.close();
    ws = null;
  };

  return {
    kind: "byok_live",
    onTranscript(listener) {
      transcriptListeners.add(listener);
      return () => transcriptListeners.delete(listener);
    },
    onPlaybackStateChange(listener) {
      playbackListeners.add(listener);
      return () => playbackListeners.delete(listener);
    },
    bargeInPlayback() {
      void invalidateDoubaoPlaybackTurn(assistantTurnId);
      endAssistantTurn();
    },
    async connect(request: RealtimeConnectionRequest) {
      dialogModel = resolveDoubaoDialogModel(request.model);
      const WebSocketImpl = resolveDoubaoWebSocket(options.DoubaoWebSocket);
      if (!WebSocketImpl) {
        throw new RealtimeVoiceTransportError(
          "Doubao voice requires header-capable WebSocket transport",
        );
      }

      await new Promise<void>((resolve, reject) => {
        const headers = buildDoubaoConnectHeaders({
          ...credentials,
          connectId: credentials.connectId ?? randomSessionId(),
        });
        const socket = new WebSocketImpl(VOLC_REALTIME_WS_URL, [], { headers });
        ws = socket;
        socket.binaryType = "arraybuffer";
        let settled = false;

        const fail = (message: string) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          onAudioReady = null;
          onAudioReadyFailed = null;
          reject(new RealtimeVoiceTransportError(message));
        };

        const succeed = () => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          onAudioReady = null;
          onAudioReadyFailed = null;
          connected = true;
          resolve();
        };

        onAudioReady = () => succeed();
        onAudioReadyFailed = (message) => {
          void teardown();
          fail(message);
        };

        const timer = setTimeout(() => {
          void teardown();
          fail("Doubao voice connection timeout");
        }, options.connectTimeoutMs ?? 20_000);

        socket.onopen = () => {
          sendFrame(encodeDoubaoStartConnection());
        };

        socket.onmessage = (event) => {
          void (async () => {
            const data = await coerceMessageToArrayBuffer(event.data);
            if (!data) {
              if (__DEV__) {
                console.warn("[doubao-voice] ignored non-binary frame", typeof event.data);
              }
              return;
            }
            handleServerFrame(data);
          })();
        };

        socket.onerror = () => fail("Doubao voice WebSocket error");

        socket.onclose = (event) => {
          connected = false;
          if (!settled) {
            fail(
              event?.code === 1008
                ? "Doubao voice connection unauthorized"
                : "Doubao voice connection closed before ready",
            );
          }
        };
      });
    },
    disconnect() {
      void teardown();
    },
    isConnected: () => connected,
  };
}

/** @deprecated name — use createDoubaoDialogVoiceTransport */
export const createDoubaoRealtimeVoiceTransport = createDoubaoDialogVoiceTransport;
