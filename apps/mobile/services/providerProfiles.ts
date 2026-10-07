import { isProfileVerified, type ProviderSettingsV2, type ServiceProfile } from "@my-brain/core";
import { getStorageSession } from "../storage/storageSession";
import type { SecureCredentialStore } from "./secureCredentialStore";

export const PROFILE_SETTINGS_KEY = "provider.settings.v2";
const JOURNAL_KEY = "provider.migration.v2";
const listeners = new Set<() => void>();
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function validProfile(value: unknown): value is ServiceProfile {
  if (!record(value)) return false;
  const roleMatches = value.role === "llm" ? value.adapterId === "openai-chat-completions"
    : value.role === "realtime" ? value.adapterId === "doubao-realtime"
      : value.role === "tts" && ["openai-audio-speech", "chat-completions-audio"].includes(String(value.adapterId));
  return roleMatches && ["id", "displayName", "baseUrl", "modelId"].every((key) => typeof value[key] === "string")
    && typeof value.credentialRef === "string" && value.credentialRef === `profile.${value.id}`
    && Number.isInteger(value.configRevision) && Number(value.configRevision) > 0
    && Number.isInteger(value.credentialRevision) && Number(value.credentialRevision) >= 0
    && ["voiceId", "style", "appId", "region"].every((key) => value[key] === undefined || typeof value[key] === "string");
}
function validSettings(value: unknown): value is ProviderSettingsV2 {
  if (!record(value) || value.schemaVersion !== 2 || !Array.isArray(value.profiles) || !value.profiles.every(validProfile)
    || new Set(value.profiles.map((profile: ServiceProfile) => profile.id)).size !== value.profiles.length
    || !record(value.voiceSelection) || !Array.isArray(value.verification)) return false;
  const selection = value.voiceSelection;
  const voiceId = selection.mode === "realtime" ? selection.realtimeProfileId : selection.mode === "composed" ? selection.ttsProfileId : undefined;
  return value.profiles.some((p: ServiceProfile) => p.id === value.activeLlmProfileId && p.role === "llm")
    && value.profiles.some((p: ServiceProfile) => p.id === voiceId && p.role === (selection.mode === "realtime" ? "realtime" : "tts"))
    && record(value.radar) && Array.isArray(value.radar.enabledSources) && value.radar.enabledSources.every((source: unknown) => typeof source === "string") && typeof value.radar.fetchIntervalMinutes === "number"
    && record(value.tokenExchange) && typeof value.tokenExchange.baseUrl === "string" && ["auto", "persisted"].includes(String(value.tokenExchange.deviceIdStrategy))
    && record(value.executionApi) && typeof value.executionApi.baseUrl === "string" && typeof value.executionApi.enabled === "boolean"
    && value.verification.every((item: unknown) => record(item) && typeof item.profileId === "string" && typeof item.live === "boolean" && typeof item.verifiedAt === "string" && Number.isInteger(item.configRevision) && Number.isInteger(item.credentialRevision));
}
export function subscribeProviderProfiles(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function loadProviderProfiles(): ProviderSettingsV2 | null {
  const raw = getStorageSession()?.storage.getMeta(PROFILE_SETTINGS_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!validSettings(value)) return null;
    return value;
  } catch { return null; }
}
export function saveProviderProfiles(settings: ProviderSettingsV2): void {
  const storage = getStorageSession()?.storage;
  if (!storage) throw new Error("本地存储尚未就绪");
  if (!validSettings(settings)) throw new Error("服务配置格式不正确，原值未修改");
  storage.setMeta(PROFILE_SETTINGS_KEY, JSON.stringify(settings));
  listeners.forEach((listener) => listener());
}
export function activeProfile(settings: ProviderSettingsV2, role: "llm" | "voice"): ServiceProfile | undefined {
  const id = role === "llm" ? settings.activeLlmProfileId : settings.voiceSelection.mode === "realtime" ? settings.voiceSelection.realtimeProfileId : settings.voiceSelection.ttsProfileId;
  return settings.profiles.find((profile) => profile.id === id);
}
export function profileReadiness(settings: ProviderSettingsV2) {
  const llm = activeProfile(settings, "llm");
  const voice = activeProfile(settings, "voice");
  const llmLive = Boolean(llm && isProfileVerified(llm, settings.verification));
  const voiceLive = Boolean(voice && isProfileVerified(voice, settings.verification) && (settings.voiceSelection.mode === "realtime" || llmLive));
  return { verified: llmLive, llmLive, voiceLive };
}
export function updateServiceProfile(profile: ServiceProfile): ProviderSettingsV2 {
  const settings = loadProviderProfiles();
  if (!settings) throw new Error("配置尚未初始化");
  const old = settings.profiles.find((item) => item.id === profile.id);
  const next = { ...profile, configRevision: (old?.configRevision ?? 0) + 1 };
  const result = { ...settings, profiles: [...settings.profiles.filter((item) => item.id !== profile.id), next], verification: settings.verification.filter((item) => item.profileId !== profile.id) };
  saveProviderProfiles(result);
  return result;
}
export function invalidateProfileCredential(profileId: string): void {
  const settings = loadProviderProfiles();
  if (!settings) return;
  saveProviderProfiles({ ...settings, profiles: settings.profiles.map((p) => p.id === profileId ? { ...p, credentialRevision: p.credentialRevision + 1 } : p), verification: settings.verification.filter((v) => v.profileId !== profileId) });
}
export function recordProfileVerification(profile: ServiceProfile, live: boolean): void {
  const settings = loadProviderProfiles();
  const current = settings?.profiles.find((p) => p.id === profile.id);
  if (!settings || !current || current.configRevision !== profile.configRevision || current.credentialRevision !== profile.credentialRevision) return;
  saveProviderProfiles({ ...settings, verification: [...settings.verification.filter((v) => v.profileId !== profile.id), {
    profileId: profile.id, configRevision: profile.configRevision, credentialRevision: profile.credentialRevision, live, verifiedAt: new Date().toISOString(),
  }] });
}

// No cross-store transaction exists: copy and verify credentials before activating v2.
const migrations = new WeakMap<object, Promise<ProviderSettingsV2>>();
export async function migrateProviderProfiles(credentials: SecureCredentialStore): Promise<ProviderSettingsV2> {
  const storage = getStorageSession()?.storage;
  if (!storage) throw new Error("本地存储尚未就绪");
  const pending = migrations.get(storage);
  if (pending) return pending;
  const operation = performMigration(credentials).finally(() => { migrations.delete(storage); });
  migrations.set(storage, operation);
  return operation;
}
async function performMigration(credentials: SecureCredentialStore): Promise<ProviderSettingsV2> {
  const existing = loadProviderProfiles();
  const storage = getStorageSession()?.storage;
  if (!storage) throw new Error("本地存储尚未就绪");
  if (existing) { storage.setMeta(JOURNAL_KEY, JSON.stringify({ phase: "complete" })); return existing; }
  if (storage.getMeta(PROFILE_SETTINGS_KEY)) throw new Error("服务配置损坏，已保留原值，请修复或恢复备份");
  const raw = storage.getMeta("provider.settings.v1");
  let old: {
    llm?: { endpoint?: string; model?: string; providerId?: string };
    voice?: { providerId?: string; voiceModel?: string; appId?: string; region?: string };
    radar?: ProviderSettingsV2["radar"]; tokenExchange?: ProviderSettingsV2["tokenExchange"]; executionApi?: ProviderSettingsV2["executionApi"];
  } = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!record(parsed) || ["llm", "voice", "radar", "tokenExchange", "executionApi"].some((section) => parsed[section] !== undefined && !record(parsed[section]))) throw new Error("Invalid legacy object");
      for (const section of ["llm", "voice"] as const) {
        const values = parsed[section];
        if (record(values) && Object.values(values).some((value) => typeof value !== "string" && value !== undefined)) throw new Error("Invalid legacy provider fields");
      }
      old = parsed as typeof old;
    }
    catch { throw new Error("旧提供商配置损坏，已保留原值，请修复后重试"); }
    if (!storage.getMeta("provider.settings.v1.backup")) storage.setMeta("provider.settings.v1.backup", raw);
  }
  if (old.voice?.providerId && !["doubao-volc", "volc-realtime", "mock"].includes(old.voice.providerId)) {
    throw new Error("旧实时提供商类型需要手动迁移；原配置与密钥已保留");
  }
  const llm: ServiceProfile = { id: "migrated-llm", displayName: old.llm?.providerId ?? "OpenAI 兼容", role: "llm", adapterId: "openai-chat-completions", baseUrl: old.llm?.endpoint ?? "", modelId: old.llm?.model ?? "", credentialRef: "profile.migrated-llm", configRevision: 1, credentialRevision: 1 };
  const voice: ServiceProfile = { id: "migrated-doubao", displayName: "豆包实时语音", role: "realtime", adapterId: "doubao-realtime", baseUrl: "", modelId: old.voice?.voiceModel ?? "1.2.1.1", appId: old.voice?.appId ?? "", region: old.voice?.region ?? "cn-north", credentialRef: "profile.migrated-doubao", configRevision: 1, credentialRevision: 1 };
  storage.setMeta(JOURNAL_KEY, JSON.stringify({ phase: "copying-credentials", llmId: llm.id, voiceId: voice.id }));
  for (const [kind, profile] of [["llm_api_key", llm], ["voice_api_key", voice]] as const) {
    const key = await credentials.get(kind);
    if (key) {
      await credentials.set(profile.credentialRef, key);
      if (await credentials.get(profile.credentialRef) !== key) throw new Error("安全凭据迁移校验失败，原值未删除");
    }
  }
  const settings: ProviderSettingsV2 = {
    schemaVersion: 2, profiles: [llm, voice], activeLlmProfileId: llm.id,
    voiceSelection: { mode: "realtime", realtimeProfileId: voice.id },
    radar: old.radar ?? { enabledSources: ["fixture"], fetchIntervalMinutes: 60 },
    tokenExchange: old.tokenExchange ?? { baseUrl: "", deviceIdStrategy: "auto" },
    executionApi: old.executionApi ?? { baseUrl: "", enabled: false }, verification: [],
  };
  saveProviderProfiles(settings);
  storage.setMeta(JOURNAL_KEY, JSON.stringify({ phase: "complete", llmId: llm.id, voiceId: voice.id }));
  return settings;
}
