import Constants from "expo-constants";

import {
  companionEnvConfigured,
  readCompanionEnvFromRecord,
} from "@my-brain/core";

import {
  loadProviderSettings,
  saveProviderSettings,
  verifyCompanionProviderGate,
} from "../services/providerConfigStore";
import { getSecureCredentialStore } from "../services/secureCredentialStore";
import { useMobileAppStore } from "../stores/mobileAppStore";

function readCompanionDevEnvRecord(): Record<string, string | undefined> {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== "object") {
    return {};
  }
  const companionDevEnv = (extra as Record<string, unknown>).companionDevEnv;
  if (!companionDevEnv || typeof companionDevEnv !== "object") {
    return {};
  }
  const record: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(companionDevEnv as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim().length > 0) {
      record[key] = value.trim();
    }
  }
  return record;
}

/**
 * Dev / Metro only: seed secure credential store + provider settings from repo `.env.local`
 * (injected via app.config.js extra). Skips when keys already exist on device.
 */
export async function seedCompanionCredentialsFromEnvIfNeeded(): Promise<void> {
  if (!__DEV__) {
    return;
  }

  const snapshot = readCompanionEnvFromRecord(readCompanionDevEnvRecord());
  if (!companionEnvConfigured(snapshot)) {
    return;
  }

  const credentialStore = getSecureCredentialStore();
  const hasLlm = await credentialStore.has("llm_api_key");
  const hasVoice = await credentialStore.has("voice_api_key");

  if (!hasLlm && snapshot.modelscopeLlmApiKey) {
    await credentialStore.set("llm_api_key", snapshot.modelscopeLlmApiKey);
  }
  if (!hasVoice && snapshot.doubaoVoiceAccessToken) {
    await credentialStore.set("voice_api_key", snapshot.doubaoVoiceAccessToken);
  }

  const settings = loadProviderSettings();
  const nextSettings = {
    ...settings,
    llm: {
      ...settings.llm,
      providerId: "modelscope",
      endpoint: snapshot.modelscopeLlmBaseUrl,
      model: snapshot.modelscopeLlmModel,
    },
    voice: {
      ...settings.voice,
      providerId: "doubao-volc",
      appId: snapshot.doubaoVoiceAppId,
    },
  };
  saveProviderSettings(nextSettings);

  const llmHasKey = hasLlm || Boolean(snapshot.modelscopeLlmApiKey);
  const voiceHasKey = hasVoice || Boolean(snapshot.doubaoVoiceAccessToken);
  if (llmHasKey) {
    useMobileAppStore.getState().setHasApiKey(true);
  }

  const llmApiKey = llmHasKey ? await credentialStore.get("llm_api_key") : null;
  const voiceApiKey = voiceHasKey ? await credentialStore.get("voice_api_key") : null;

  const gate = await verifyCompanionProviderGate({
    settings: nextSettings,
    llmHasKey,
    llmApiKey,
    voiceHasKey,
    voiceApiKey,
  });

  useMobileAppStore.getState().applyProviderVerification(gate.verification);
}
