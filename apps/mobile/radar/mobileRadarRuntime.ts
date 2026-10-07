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
    return (url, request) => providerFetch(url, { method: request?.method ?? "GET", headers: request?.headers ?? {}, signal: request?.signal });
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
  const apiKey = await (options.credentialStore ?? getSecureCredentialStore()).get("llm_api_key");
  const hasLlmKey = Boolean(apiKey?.trim()) && llmSettings.providerId !== "mock";
  const liveRadarEnabled =
    radarSettings.enabledSources.length > 0 &&
    !radarSettings.enabledSources.every((source) => source === "fixture");
  const liveEnabled = hasLlmKey && liveRadarEnabled;
  const llm =
    options.llm ??
    (liveEnabled && apiKey
      ? createConfiguredLlmProvider(llmSettings, apiKey.trim(), fetchImpl)
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
