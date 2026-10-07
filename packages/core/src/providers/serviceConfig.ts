import { createOpenAiCompatibleLlmProvider } from "./openAiCompatibleLlmProvider.js";
import type { LlmFetch } from "./openAiCompatibleClient.js";

export type ServiceRole = "llm" | "tts" | "realtime";
export type ServiceAdapterId = "openai-chat-completions" | "openai-audio-speech" | "chat-completions-audio" | "doubao-realtime";
export interface ServiceProfile {
  id: string;
  displayName: string;
  role: ServiceRole;
  adapterId: ServiceAdapterId;
  baseUrl: string;
  credentialRef: `profile.${string}`;
  configRevision: number;
  credentialRevision: number;
  modelId: string;
  voiceId?: string;
  style?: string;
  appId?: string;
  region?: string;
}
export interface ServiceVerification {
  profileId: string;
  configRevision: number;
  credentialRevision: number;
  verifiedAt: string;
  live: boolean;
}
export interface ProviderSettingsV2 {
  schemaVersion: 2;
  profiles: ServiceProfile[];
  activeLlmProfileId: string;
  voiceSelection: { mode: "realtime"; realtimeProfileId: string } | { mode: "composed"; ttsProfileId: string };
  radar: { enabledSources: string[]; fetchIntervalMinutes: number };
  tokenExchange: { baseUrl: string; deviceIdStrategy: "auto" | "persisted" };
  executionApi: { baseUrl: string; enabled: boolean };
  verification: ServiceVerification[];
}

export function normalizeServiceBaseUrl(raw: string): string {
  const url = new URL(raw.trim());
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const local = host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host === "::1"
    || /^(0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
    || (host.includes(":") && (!/^[23][0-9a-f]{3}:/.test(host) || host.startsWith("2001:db8:")))
    || /^(100\.(6[4-9]|[78]\d|9\d|1[01]\d|12[0-7])\.|198\.(18|19)\.|192\.0\.0\.)/.test(host);
  if (url.protocol !== "https:" || local || url.username || url.password || url.search || url.hash) {
    throw new Error("请填写公网 HTTPS API 基地址，不包含账号、查询参数或片段");
  }
  return url.toString().replace(/\/+$/, "");
}

export function createConfiguredLlmProvider(config: { endpoint: string; model: string }, apiKey: string, fetch: LlmFetch) {
  if (!config.model.trim() || !apiKey.trim()) throw new Error("请填写模型 ID 和 API Key");
  return createOpenAiCompatibleLlmProvider({ baseUrl: normalizeServiceBaseUrl(config.endpoint), model: config.model.trim(), apiKey: apiKey.trim(), fetch });
}

export function isProfileVerified(profile: ServiceProfile, verification: ServiceVerification[], now = Date.now()): boolean {
  return verification.some((v) => v.live && v.profileId === profile.id && v.configRevision === profile.configRevision
    && v.credentialRevision === profile.credentialRevision && now - Date.parse(v.verifiedAt) < 86_400_000
    && now >= Date.parse(v.verifiedAt));
}

export const MIMO_VOICE_PRESETS = ["冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean", "mimo_default"];
