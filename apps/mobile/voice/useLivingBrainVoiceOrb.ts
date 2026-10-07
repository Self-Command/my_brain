import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";

import type { UserIntent } from "@my-brain/core";

import {
  voiceOrbAccessibilityLabel,
  type VoiceOrbState,
} from "../components/ui/VoiceOrb";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { createDeviceAudioIoPort, type DeviceAudioIoPort } from "./deviceAudioClient";
import { activeProfile, loadProviderProfiles, subscribeProviderProfiles } from "../services/providerProfiles";
import { createTtsPlayback } from "./ttsPlayback";
import { replyToVoiceChat } from "../services/configuredLlm";
import {
  createVoiceSessionController,
  type VoiceSessionController,
  type VoiceSessionDeps,
} from "./VoiceSession";
import { registerActiveVoiceController } from "./voiceAppLifecycle";
import { createInitialVoiceSnapshot } from "./VoiceSessionFsm";
import type { VoiceFsmState } from "./VoiceSessionFsm";

const LIVING_BRAIN_DEVICE_ID = "living-brain-voice";
const IDLE_VOICE_SNAPSHOT = createInitialVoiceSnapshot();

let livingBrainAudioIo: DeviceAudioIoPort | undefined;

function getLivingBrainAudioIo(): DeviceAudioIoPort {
  livingBrainAudioIo ??= createDeviceAudioIoPort("device_stub");
  return livingBrainAudioIo;
}

function mapFsmToOrbState(
  fsm: VoiceFsmState,
  voiceDisconnected: boolean,
  connected: boolean,
): VoiceOrbState {
  if (voiceDisconnected) {
    return "degraded";
  }
  if (!connected && fsm === "error") {
    return "error";
  }
  if (!connected) {
    return "idle";
  }
  if (fsm === "error") {
    return "error";
  }
  return fsm;
}

export interface LivingBrainVoiceOrbOptions {
  enabled: boolean;
  dispatchIntent: (intent: UserIntent) => string | void;
  dispatchVoiceIntent?: (intent: UserIntent, signal?: AbortSignal) => Promise<string | void>;
}

export function useLivingBrainVoiceOrb({ enabled, dispatchIntent, dispatchVoiceIntent }: LivingBrainVoiceOrbOptions) {
  const [configEpoch, setConfigEpoch] = useState(0);
  useEffect(() => subscribeProviderProfiles(() => setConfigEpoch((value) => value + 1)), []);
  const setVoiceDisconnected = useMobileAppStore((s) => s.setVoiceDisconnected);
  const voiceDisconnected = useMobileAppStore((s) =>
    s.degraded.active.includes("voice_disconnected"),
  );
  const [connected, setConnected] = useState(false);
  const [controller, setController] = useState<VoiceSessionController | null>(null);
  const ingestAttemptRef = useRef<1 | 2>(1);
  const dispatchIntentRef = useRef(dispatchIntent);
  dispatchIntentRef.current = dispatchIntent;
  const dispatchVoiceIntentRef = useRef(dispatchVoiceIntent);
  dispatchVoiceIntentRef.current = dispatchVoiceIntent;

  const platformOs: "android" | "ios" = Platform.OS === "ios" ? "ios" : "android";

  const sessionDeps = useMemo(
    (): VoiceSessionDeps => ({
      deviceId: LIVING_BRAIN_DEVICE_ID,
      platformOs,
      skipMicPermissionCheck: !enabled,
      audioIo: getLivingBrainAudioIo(),
      onIntent: (intent) => dispatchIntentRef.current(intent),
      onAsyncIntent: (intent, signal) => dispatchVoiceIntentRef.current?.(intent, signal) ?? Promise.resolve(dispatchIntentRef.current(intent)),
      onFreeformTranscript: replyToVoiceChat,
      isAwaitingConfirmation: () => {
        const conversation = useMobileAppStore.getState().conversation;
        return conversation.phase === "ingest_pending" || conversation.phase === "provisional_pending" || conversation.activeSignalId !== null || conversation.activeProvisionalId !== null;
      },
      onDegradedVoice: () => setVoiceDisconnected(true),
      onClearDegradedVoice: () => setVoiceDisconnected(false),
    }),
    [enabled, platformOs, setVoiceDisconnected],
  );
  const sessionDepsRef = useRef(sessionDeps);
  sessionDepsRef.current = sessionDeps;

  useEffect(() => {
    if (!enabled) {
      setController((current) => {
        current?.disconnect();
        return null;
      });
      registerActiveVoiceController(null);
      setConnected(false);
      ingestAttemptRef.current = 1;
      return;
    }
    const settings = loadProviderProfiles();
    const profile = settings ? activeProfile(settings, "voice") : undefined;
    const tts = settings?.voiceSelection.mode === "composed" && profile ? createTtsPlayback(profile) : null;
    const session = createVoiceSessionController({ ...sessionDepsRef.current, ...(tts ? { audioIo: tts.port } : {}) });
    setConnected(false);
    setController(session);
    registerActiveVoiceController(session);
    return () => {
      session.disconnect();
      if (tts) void tts.dispose().catch(() => undefined);
      setController(null);
      registerActiveVoiceController(null);
    };
  }, [enabled, configEpoch]);

  const subscribe = useCallback(
    (cb: () => void) => controller?.subscribe(cb) ?? (() => undefined),
    [controller],
  );
  const getSnapshot = useCallback(
    () => controller?.getSnapshot() ?? IDLE_VOICE_SNAPSHOT,
    [controller],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const orbState = useMemo(
    () => mapFsmToOrbState(snapshot.state, voiceDisconnected, connected),
    [snapshot.state, voiceDisconnected, connected],
  );

  const accessibilityLabel = useMemo(
    () => voiceOrbAccessibilityLabel(orbState, snapshot.lastError),
    [orbState, snapshot.lastError],
  );

  const onOrbPress = useCallback(async () => {
    if (!enabled || !controller) {
      return;
    }
    if (snapshot.state === "speaking") {
      controller.bargeIn();
      ingestAttemptRef.current = 1;
      return;
    }
    try {
      await controller.connect();
      setConnected(true);
      ingestAttemptRef.current = 1;
    } catch {
      setConnected(false);
    }
  }, [enabled, controller, snapshot.state]);

  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      if (!enabled || !connected || !controller) {
        return null;
      }
      const attempt = ingestAttemptRef.current;
      const result = controller.handleTranscript(transcript, attempt);
      if (result === "reprompt") {
        ingestAttemptRef.current = 2;
        return "reprompt" as const;
      }
      ingestAttemptRef.current = 1;
      return result;
    },
    [enabled, connected, controller],
  );

  return {
    orbState,
    accessibilityLabel,
    onOrbPress,
    handleVoiceTranscript,
    voiceState: snapshot.state,
    lastError: snapshot.lastError,
    connected,
  };
}
