import { isProfileVerified, type ProviderSettingsV2, type ServiceProfile } from "@my-brain/core";
import { getStorageSession } from "../storage/storageSession";
import type { SecureCredentialStore } from "./secureCredentialStore";

export const PROFILE_SETTINGS_KEY = "provider.settings.v2";
const JOURNAL_KEY = "provider.migration.v2";
const listeners = new Set<() => void>();
export function subscribeProviderProfiles(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function loadProviderProfiles(): ProviderSettingsV2 | null {
  const raw = getStorageSession()?.storage.getMeta(PROFILE_SETTINGS_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ProviderSettingsV2;
    if (value.schemaVersion !== 2 || !Array.isArray(value.profiles) || !Array.isArray(value.verification)) return null;
    return value;
  } catch { return null; }
}
export function saveProviderProfiles(settings: ProviderSettingsV2): void {
  const storage = getStorageSession()?.storage;
  if (!storage) throw new Error("本地存储尚未就绪");
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
  const voiceLive = Boolean(voice && isProfileVerified(voice, settings.verification));
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
export async function migrateProviderProfiles(credentials: SecureCredentialStore): Promise<ProviderSettingsV2> {
  const existing = loadProviderProfiles();
  if (existing) return existing;
  const storage = getStorageSession()?.storage;
  if (!storage) throw new Error("本地存储尚未就绪");
  const raw = storage.getMeta("provider.settings.v1");
  let old: {
    llm?: { endpoint?: string; model?: string; providerId?: string };
    voice?: { providerId?: string; voiceModel?: string; appId?: string; region?: string };
    radar?: ProviderSettingsV2["radar"]; tokenExchange?: ProviderSettingsV2["tokenExchange"]; executionApi?: ProviderSettingsV2["executionApi"];
  } = {};
  if (raw) {
    try { old = JSON.parse(raw) as typeof old; }
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
