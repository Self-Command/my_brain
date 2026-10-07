import type {
  DegradedModeCode,
  LlmProvider,
  RadarFetch,
  UserModeProfile,
} from "@my-brain/core";
import {
  createConfiguredLlmProvider as createCoreConfiguredLlmProvider,
  createMockLlmProvider,
  fetchLiveRadarSignals,
} from "@my-brain/core";

import { getSecureCredentialStore, type SecureCredentialStore } from "../services/secureCredentialStore";
import { providerFetch } from "../services/providerHttp";
import { activeProfile, loadProviderProfiles } from "../services/providerProfiles";
import {
  loadProviderSettings,
  type LlmConnectionFetch,
  type LlmProviderConfig,
  type RadarSourceConfig,
} from "../services/providerConfigStore";

export interface ResolveMobileRadarOptions {
  profile: UserModeProfile;
  suppressionList?: string[];
  fetch?: RadarFetch;
  llm?: LlmProvider;
  credentialStore?: SecureCredentialStore;
  radarSettings?: RadarSourceConfig;
  llmSettings?: LlmProviderConfig;
}

export interface MobileRadarRuntimeResult {
  signals: Awaited<ReturnType<typeof fetchLiveRadarSignals>>["signals"];
  providerMode: "mock" | "degraded" | "live";
  activeCodes: DegradedModeCode[];
  sourceKind: "fixture" | "live";
  degradedReasons: string[];
}

function resolveRadarFetch(explicit?: RadarFetch): RadarFetch {
  if (explicit) {
    return explicit;
  }
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch as RadarFetch;
  }
  return async () => {
    throw new Error("fetch unavailable");
  };
}

function createConfiguredLlmProvider(
  settings: LlmProviderConfig,
  apiKey: string,
  fetchImpl: RadarFetch,
): LlmProvider {
  return createCoreConfiguredLlmProvider(settings, apiKey, fetchImpl as LlmConnectionFetch);
}

export async function resolveMobileRadarSignals(
  options: ResolveMobileRadarOptions,
): Promise<MobileRadarRuntimeResult> {
  const settings = loadProviderSettings();
  const radarSettings = options.radarSettings ?? settings.radar;
  const llmSettings = options.llmSettings ?? settings.llm;
  const fetchImpl = resolveRadarFetch(options.fetch);
  const profiles = loadProviderProfiles();
  const capturedProfile = profiles && !options.llmSettings ? activeProfile(profiles, "llm") : undefined;
  const apiKey = await (options.credentialStore ?? getSecureCredentialStore()).get(capturedProfile?.credentialRef ?? "llm_api_key");
  if (capturedProfile) {
    const latest = loadProviderProfiles(); const current = latest ? activeProfile(latest, "llm") : undefined;
    if (current?.id !== capturedProfile.id || current.configRevision !== capturedProfile.configRevision || current.credentialRevision !== capturedProfile.credentialRevision) throw new Error("服务配置已改变，请重新获取");
  }
  const hasLlmKey = Boolean(apiKey?.trim()) && llmSettings.providerId !== "mock";
  const liveRadarEnabled =
    radarSettings.enabledSources.length > 0 &&
    !radarSettings.enabledSources.every((source) => source === "fixture");
  const liveEnabled = hasLlmKey && liveRadarEnabled;
  const llm =
    options.llm ??
    (liveEnabled && apiKey
      ? createConfiguredLlmProvider(llmSettings, apiKey.trim(), options.fetch ?? providerFetch as LlmConnectionFetch)
      : createMockLlmProvider());

  const result = await fetchLiveRadarSignals({
    fetch: fetchImpl,
    llm,
    profile: options.profile,
    suppressionList: options.suppressionList,
    liveEnabled,
  });

  if (result.mode === "live") {
    return {
      signals: result.signals,
      providerMode: "live",
      activeCodes: [],
      sourceKind: result.sourceKind,
      degradedReasons: result.degradedReasons,
    };
  }

  return {
    signals: result.signals,
    providerMode: result.mode,
    activeCodes: liveEnabled ? [] : ["mock_llm", "fixture_radar"],
    sourceKind: result.sourceKind,
    degradedReasons: result.degradedReasons,
  };
}
