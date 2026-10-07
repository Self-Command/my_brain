import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";

import { resetVoiceSessionSingleton, useVoiceSession } from "../voice/VoiceSession";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { colors } from "../theme/tokens";

const M3_DIAG_DEVICE_ID = "m3-voice-diagnostics";
/** Long mock playback window for on-device barge-in evidence capture. */
export const M3_DIAG_LONG_SPEAK_DURATION_MS = 10_000;

function resolveRuntimeBuildLabel(): string {
  const nativeBuild = Constants.nativeBuildVersion;
  if (typeof nativeBuild === "string" && nativeBuild.trim().length > 0) {
    return nativeBuild;
  }
  return "dev/mock";
}

function formatEvidenceTemplate(fields: {
  platform: string;
  osVersion: string;
  build: string;
  deviceModel: string;
  recordedAt: string;
  bargeInStopLatencyMs: number | null;
  result: string;
  videoFile: string;
  transportMode: string;
  fsmState: string;
}): string {
  return [
    "m3VoiceBargeInEvidence:",
    `  platform: ${fields.platform}`,
    `  osVersion: ${fields.osVersion}`,
    `  build: ${fields.build}`,
    `  deviceModel: ${fields.deviceModel}`,
    `  recordedAt: ${fields.recordedAt}`,
    `  bargeInStopLatencyMs: ${fields.bargeInStopLatencyMs ?? "null"}`,
    `  result: ${fields.result}`,
    `  videoFile: ${fields.videoFile}`,
    `  transportMode: ${fields.transportMode}`,
    `  fsmState: ${fields.fsmState}`,
  ].join("\n");
}

export function M3VoiceDiagnosticsPanel() {
  const setVoiceDisconnected = useMobileAppStore((s) => s.setVoiceDisconnected);
  const platform = Platform.OS;
  const voice = useVoiceSession({
    deviceId: M3_DIAG_DEVICE_ID,
    voiceSettings: { providerId: "mock", voiceModel: "mock-diagnostics", region: "" },
    platformOs: platform === "ios" ? "ios" : "android",
    skipMicPermissionCheck: true,
    onDegradedVoice: () => setVoiceDisconnected(true),
    onClearDegradedVoice: () => setVoiceDisconnected(false),
  });
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [bargeInStartedAt, setBargeInStartedAt] = useState<number | null>(null);
  const [stopLatencyMs, setStopLatencyMs] = useState<number | null>(null);
  const [lastBargeInResult, setLastBargeInResult] = useState<string>("pending");
  const bargeInStartedAtRef = useRef<number | null>(null);

  const osVersion = String(Platform.Version);
  const build = resolveRuntimeBuildLabel();
  const transportPlaying = voice.isPlaying();

  const finalizeStopLatency = useCallback((startedAt: number) => {
    const latency = Math.max(0, Math.round(performance.now() - startedAt));
    setStopLatencyMs(latency);
    setLastBargeInResult("stopped");
    setBargeInStartedAt(null);
    bargeInStartedAtRef.current = null;
  }, []);

  useEffect(() => {
    const startedAt = bargeInStartedAtRef.current;
    if (startedAt === null) {
      return;
    }
    if (!transportPlaying) {
      finalizeStopLatency(startedAt);
    }
  }, [transportPlaying, finalizeStopLatency]);

  const onConnect = useCallback(async () => {
    setConnectError(null);
    try {
      await voice.connect();
      setConnected(true);
    } catch (e) {
      setConnected(false);
      setConnectError(e instanceof Error ? e.message : "connect failed");
    }
  }, [voice]);

  const onStartLongSpeak = useCallback(() => {
    voice.simulateAssistantSpeak(1, M3_DIAG_LONG_SPEAK_DURATION_MS);
    setLastBargeInResult("pending");
    setStopLatencyMs(null);
  }, [voice]);

  const onBargeIn = useCallback(() => {
    if (voice.state !== "speaking") {
      setLastBargeInResult("skipped_not_speaking");
      return;
    }
    const startedAt = performance.now();
    setBargeInStartedAt(startedAt);
    bargeInStartedAtRef.current = startedAt;
    setStopLatencyMs(null);
    setLastBargeInResult("measuring");
    voice.bargeIn();
    if (!voice.isPlaying()) {
      finalizeStopLatency(startedAt);
    }
  }, [voice, finalizeStopLatency]);

  const onSimulateDisconnect = useCallback(() => {
    voice.simulateTransportError();
    setConnected(false);
    setLastBargeInResult("transport_error");
  }, [voice]);

  const onResetSession = useCallback(() => {
    voice.disconnect();
    resetVoiceSessionSingleton();
    setConnected(false);
    setConnectError(null);
    setBargeInStartedAt(null);
    bargeInStartedAtRef.current = null;
    setStopLatencyMs(null);
    setLastBargeInResult("pending");
  }, [voice]);

  const evidenceTemplate = useMemo(
    () =>
      formatEvidenceTemplate({
        platform,
        osVersion,
        build,
        deviceModel: "(待填写)",
        recordedAt: new Date().toISOString(),
        bargeInStopLatencyMs: stopLatencyMs,
        result: lastBargeInResult,
        videoFile: "(待填写录屏文件名)",
        transportMode: "mock transport / 真机诊断辅助，不等于 live provider",
        fsmState: voice.state,
      }),
    [platform, osVersion, build, stopLatencyMs, lastBargeInResult, voice.state],
  );

  const onShareEvidence = useCallback(async () => {
    await Share.share({ message: evidenceTemplate });
  }, [evidenceTemplate]);

  return (
    <View testID="m3-voice-diagnostics-panel">
      <Text style={styles.section}>M3 语音插话诊断（Dev Client）</Text>
      <Text style={styles.mockBanner} testID="m3-voice-mock-banner">
        长播报采证模式 · mock transport · 真机诊断辅助，不等于 live Realtime provider
      </Text>
      <Text style={styles.hint} testID="m3-voice-long-speak-hint">
        点击「开始长播报（10 秒）」后，FSM 应保持 speaking、播放中保持「是」约 10 秒，便于录屏后点「插话停止」。
      </Text>

      <Text style={styles.row} testID="m3-voice-platform">
        Platform：{platform}
      </Text>
      <Text style={styles.row} testID="m3-voice-os-version">
        OS Version：{osVersion}
      </Text>
      <Text style={styles.row} testID="m3-voice-build">
        Build / Runtime：{build}
      </Text>

      <Text style={styles.row} testID="m3-voice-fsm-state">
        FSM：{voice.state}
      </Text>
      <Text style={styles.row} testID="m3-voice-playing">
        播放中：{transportPlaying ? "是" : "否"}
      </Text>
      {voice.lastError ? (
        <Text style={styles.row} testID="m3-voice-last-error">
          lastError：{voice.lastError}
        </Text>
      ) : null}
      {connectError ? (
        <Text style={styles.row} testID="m3-voice-connect-error">
          connectError：{connectError}
        </Text>
      ) : null}
      {bargeInStartedAt !== null ? (
        <Text style={styles.row} testID="m3-voice-barge-in-started">
          bargeInStartedAt：{Math.round(bargeInStartedAt)}
        </Text>
      ) : null}
      {stopLatencyMs !== null ? (
        <Text style={styles.row} testID="m3-voice-stop-latency">
          stopLatencyMs（mock 近似）：{stopLatencyMs}
        </Text>
      ) : null}
      <Text style={styles.row} testID="m3-voice-barge-in-result">
        插话结果：{lastBargeInResult}
      </Text>

      <Pressable onPress={() => void onConnect()} style={styles.button} testID="m3-voice-connect">
        <Text style={styles.buttonText}>连接语音（mock token）</Text>
      </Pressable>
      <Pressable
        onPress={onStartLongSpeak}
        style={styles.button}
        testID="m3-voice-long-speak"
        disabled={!connected}
      >
        <Text style={styles.buttonText}>开始长播报（10 秒）</Text>
      </Pressable>
      <Pressable onPress={onBargeIn} style={styles.button} testID="m3-voice-barge-in">
        <Text style={styles.buttonText}>插话停止</Text>
      </Pressable>
      <Pressable
        onPress={onSimulateDisconnect}
        style={styles.button}
        testID="m3-voice-simulate-disconnect"
      >
        <Text style={styles.buttonText}>模拟断连 / 降级</Text>
      </Pressable>
      <Pressable onPress={onResetSession} style={styles.button} testID="m3-voice-reset">
        <Text style={styles.buttonText}>重置诊断会话</Text>
      </Pressable>

      <Text style={styles.section}>证据模板（录屏时一并展示）</Text>
      <Text style={styles.evidence} testID="m3-voice-evidence-template">
        {evidenceTemplate}
      </Text>
      <Pressable onPress={() => void onShareEvidence()} style={styles.button} testID="m3-voice-share-evidence">
        <Text style={styles.buttonText}>分享 / 复制证据模板</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  mockBanner: {
    color: colors.accent,
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 18,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 8,
    lineHeight: 18,
  },
  row: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 6,
  },
  button: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
  },
  evidence: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    lineHeight: 18,
    marginBottom: 8,
  },
});
