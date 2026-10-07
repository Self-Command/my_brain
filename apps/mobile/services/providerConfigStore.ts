import {
  createConfiguredLlmProvider,
  DEFAULT_MODELSCOPE_MODEL,
  testDoubaoVoiceConnection,
  type DoubaoWebSocketConstructor,
  type LlmConnectionTestResult,
  type ProviderConfigSnapshot,
} from "@my-brain/core";

import {
  testRealtimeVoiceTransport,
  type WebSocketConstructor,
} from "../voice/realtimeVoiceTransport";
import { getStorageSession } from "../storage/storageSession";
import { validateProviderHttpsUrl } from "./providerUrlValidation";
import { activeProfile, loadProviderProfiles, profileReadiness, saveProviderProfiles } from "./providerProfiles";
import { providerFetch } from "./providerHttp";

/** Matches packages/core openAiCompatibleClient LlmFetch — injected in tests. */
export type LlmConnectionFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface LlmConnectionTestOptions {
  hasKey: boolean;
  apiKey?: string | null;
  fetch?: LlmConnectionFetch;
}

export const PROVIDER_SETTINGS_META_KEY = "provider.settings.v1";
export const PROVIDER_VERIFICATION_META_KEY = "provider.verification.v1";

export interface ProviderVerificationState {
  verified: boolean;
  llmLive: boolean;
  voiceLive: boolean;
  verifiedAt?: string;
}

export interface LlmProviderConfig {
  providerId: string;
  model: string;
  endpoint: string;
}

export interface VoiceProviderConfig {
  providerId: string;
  voiceModel: string;
  region: string;
  /** Doubao / Volc App ID (X-Api-App-ID) — not the access token. */
  appId?: string;
}

export interface RadarSourceConfig {
  enabledSources: string[];
  fetchIntervalMinutes: number;
}

export interface TokenExchangeConfig {
  baseUrl: string;
  deviceIdStrategy: "auto" | "persisted";
}

export interface ExecutionApiConfig {
  baseUrl: string;
  /** Default off — S14 config only; no remote writes until S16. */
  enabled: boolean;
}

export interface ProviderSettingsConfig {
  llm: LlmProviderConfig;
  voice: VoiceProviderConfig;
  radar: RadarSourceConfig;
  tokenExchange: TokenExchangeConfig;
  executionApi: ExecutionApiConfig;
}

export type ConnectionTestStatus = "live" | "mock" | "degraded" | "error";

export interface ConnectionTestResult {
  status: ConnectionTestStatus;
  code?: string;
  hint?: string;
  endpointSummary?: string;
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettingsConfig = {
  llm: {
    providerId: "modelscope",
    model: DEFAULT_MODELSCOPE_MODEL,
    endpoint: "https://api-inference.modelscope.cn/v1",
  },
  voice: {
    providerId: "doubao-volc",
    voiceModel: "1.2.1.1",
    region: "cn-north",
    appId: "",
  },
  radar: {
    enabledSources: ["fixture"],
    fetchIntervalMinutes: 60,
  },
  tokenExchange: {
    baseUrl: "",
    deviceIdStrategy: "auto",
  },
  executionApi: {
    baseUrl: "",
    enabled: false,
  },
};

function mergeSettings(partial: Partial<ProviderSettingsConfig>): ProviderSettingsConfig {
  return {
    llm: { ...DEFAULT_PROVIDER_SETTINGS.llm, ...partial.llm },
    voice: { ...DEFAULT_PROVIDER_SETTINGS.voice, ...partial.voice },
    radar: { ...DEFAULT_PROVIDER_SETTINGS.radar, ...partial.radar },
    tokenExchange: {
      ...DEFAULT_PROVIDER_SETTINGS.tokenExchange,
      ...partial.tokenExchange,
    },
    executionApi: {
      ...DEFAULT_PROVIDER_SETTINGS.executionApi,
      ...partial.executionApi,
    },
  };
}

export function loadProviderSettings(): ProviderSettingsConfig {
  const profiles = loadProviderProfiles();
  if (profiles) {
    const llm = activeProfile(profiles, "llm");
    const voice = activeProfile(profiles, "voice");
    return { llm: { providerId: "openai-compatible", endpoint: llm?.baseUrl ?? "", model: llm?.modelId ?? "" },
      voice: { providerId: profiles.voiceSelection.mode === "realtime" ? "doubao-volc" : "composed", voiceModel: voice?.modelId ?? "", appId: voice?.appId, region: voice?.region ?? "" },
      radar: profiles.radar, tokenExchange: profiles.tokenExchange, executionApi: profiles.executionApi };
  }
  const session = getStorageSession();
  const raw = session?.storage.getMeta(PROVIDER_SETTINGS_META_KEY);
  if (!raw) {
    return { ...DEFAULT_PROVIDER_SETTINGS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProviderSettingsConfig>;
    return mergeSettings(parsed);
  } catch {
    return { ...DEFAULT_PROVIDER_SETTINGS };
  }
}

export function saveProviderSettings(config: ProviderSettingsConfig): void {
  const profiles = loadProviderProfiles();
  if (profiles) {
    saveProviderProfiles({ ...profiles, radar: config.radar, tokenExchange: config.tokenExchange, executionApi: config.executionApi });
    return;
  }
  const session = getStorageSession();
  session?.storage.setMeta(PROVIDER_SETTINGS_META_KEY, JSON.stringify(config));
}

export function loadProviderVerification(): ProviderVerificationState {
  const profiles = loadProviderProfiles();
  if (profiles) return profileReadiness(profiles);
  const session = getStorageSession();
  const raw = session?.storage.getMeta(PROVIDER_VERIFICATION_META_KEY);
  if (!raw) {
    return { verified: false, llmLive: false, voiceLive: false };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProviderVerificationState>;
    return {
      verified: parsed.verified === true,
      llmLive: parsed.llmLive === true,
      voiceLive: parsed.voiceLive === true,
      verifiedAt: parsed.verifiedAt,
    };
  } catch {
    return { verified: false, llmLive: false, voiceLive: false };
  }
}

export function saveProviderVerification(state: ProviderVerificationState): void {
  const session = getStorageSession();
  session?.storage.setMeta(PROVIDER_VERIFICATION_META_KEY, JSON.stringify(state));
}

/** Main home route is enabled only when both companion providers passed live checks. */
export function evaluateProviderGateResults(
  llm: ConnectionTestResult,
  voice: ConnectionTestResult,
): ProviderVerificationState {
  const llmLive = llm.status === "live";
  const voiceLive = voice.status === "live";
  const verified = llmLive;
  return {
    verified,
    llmLive,
    voiceLive,
    verifiedAt: verified ? new Date().toISOString() : undefined,
  };
}

export function selectMainRouteEnabled(verification: ProviderVerificationState): boolean {
  return verification.verified && verification.llmLive;
}

export function appendProviderConfigAudit(
  field: string,
  outcome: "ok" | "fail" | "degraded" | "skipped",
  reasonCode: string,
): void {
  const session = getStorageSession();
  session?.storage.appendDiagnosticEvent({
    intent: "provider_config_change",
    outcome,
    reasonCode,
    userMode: field,
  });
}

export function deriveProviderSnapshotFromSettings(
  settings: ProviderSettingsConfig,
  hasLlmKey: boolean,
  hasVoiceKey: boolean,
  voiceDisconnected: boolean,
): ProviderConfigSnapshot {
  const llmConfigured = hasLlmKey && settings.llm.providerId !== "mock";
  const radarLive =
    settings.radar.enabledSources.length > 0 &&
    !settings.radar.enabledSources.every((s) => s === "fixture");

  return {
    llm: llmConfigured ? "degraded" : "mock",
    radar: radarLive ? "degraded" : "fixture",
    voice: voiceDisconnected || hasVoiceKey ? "disconnected" : "mock",
    storage: "ready",
    lastErrorCode: llmConfigured
      ? "ProviderConnectionUntested"
      : radarLive
        ? "RadarRuntimeCheckRequired"
        : undefined,
  };
}

function resolveLlmFetch(fetch?: LlmConnectionFetch): LlmConnectionFetch {
  if (fetch) {
    return fetch;
  }
  if (typeof globalThis.fetch === "function") {
    return providerFetch;
  }
  throw new Error("fetch is unavailable for LLM connection test");
}

function mapCoreLlmConnectionResult(
  result: LlmConnectionTestResult,
  endpointSummary: string,
): ConnectionTestResult {
  if (result.status === "connected") {
    return {
      status: "live",
      hint: "已连接",
      endpointSummary,
    };
  }
  if (result.status === "degraded") {
    return {
      status: "degraded",
      code: result.errorCode,
      hint: result.message ?? "服务降级",
      endpointSummary,
    };
  }
  return {
    status: "error",
    code: result.errorCode ?? "ProviderConfigError",
    hint: result.message ?? "连接失败",
    endpointSummary,
  };
}

function createLlmProviderForTest(
  settings: LlmProviderConfig,
  apiKey: string,
  fetchImpl: LlmConnectionFetch,
) {
  return createConfiguredLlmProvider(settings, apiKey, fetchImpl);
}

export async function testLlmConnection(
  settings: LlmProviderConfig,
  options: LlmConnectionTestOptions | boolean,
): Promise<ConnectionTestResult> {
  const { hasKey, apiKey, fetch: fetchImpl } =
    typeof options === "boolean"
      ? { hasKey: options, apiKey: undefined, fetch: undefined }
      : options;

  const endpointSummary = settings.endpoint.trim() || settings.providerId;

  if (!hasKey || settings.providerId === "mock") {
    return {
      status: "mock",
      hint: "演示模式 — 未配置 API Key",
      endpointSummary: endpointSummary || "mock",
    };
  }

  if (!apiKey?.trim()) {
    return {
      status: "mock",
      hint: "演示模式 — 未配置 API Key",
      endpointSummary,
    };
  }

  const needsEndpoint =
    settings.providerId !== "deepseek" && settings.providerId !== "mock";
  if (needsEndpoint && !settings.endpoint.trim()) {
    return {
      status: "error",
      code: "ProviderConfigError",
      hint: "请填写 endpoint",
      endpointSummary,
    };
  }

  try {
    const provider = createLlmProviderForTest(
      settings,
      apiKey,
      resolveLlmFetch(fetchImpl),
    );
    const result = await provider.testConnection();
    return mapCoreLlmConnectionResult(result, endpointSummary);
  } catch (error) {
    return {
      status: "error",
      code: "NETWORK_ERROR",
      hint: error instanceof Error ? error.message : "LLM connection test failed",
      endpointSummary,
    };
  }
}

export interface VoiceConnectionTestOptions {
  apiKey?: string | null;
  WebSocket?: WebSocketConstructor;
  /** Header-capable WebSocket for Doubao / Volc handshake tests. */
  DoubaoWebSocket?: DoubaoWebSocketConstructor;
}

/** RN WebSocket supports custom headers; Node CLI gate runner does not. */
function resolveDoubaoWebSocket(
  override?: DoubaoWebSocketConstructor,
): DoubaoWebSocketConstructor | undefined {
  if (override) {
    return override;
  }
  const candidate = globalThis.WebSocket as DoubaoWebSocketConstructor | undefined;
  if (typeof candidate !== "function") {
    return undefined;
  }
  try {
    const probe = candidate as unknown as { readonly CONNECTING?: number };
    if (typeof probe.CONNECTING === "number") {
      return candidate;
    }
  } catch {
    return undefined;
  }
  return candidate;
}

function mapDoubaoCoreResultToConnectionTest(
  result: Awaited<ReturnType<typeof testDoubaoVoiceConnection>>,
  endpointSummary: string,
): ConnectionTestResult {
  if (result.status === "connected") {
    return { status: "live", hint: "已连接", endpointSummary };
  }
  if (result.errorCode === "NATIVE_TRANSPORT_REQUIRED") {
    return {
      status: "degraded",
      code: result.errorCode,
      hint: "需要原生 WebSocket Header 传输层才能执行豆包实时检测",
      endpointSummary,
    };
  }
  if (result.errorCode === "MISSING_API_KEY") {
    return {
      status: "mock",
      hint: "演示模式 — 未配置豆包语音凭证",
      endpointSummary,
    };
  }
  return {
    status: "error",
    code: result.errorCode ?? "TRANSPORT_ERROR",
    hint: result.message ?? "豆包语音连接失败",
    endpointSummary,
  };
}

export async function testDoubaoVoiceConnectionFromSettings(
  settings: VoiceProviderConfig,
  hasAccessToken: boolean,
  accessToken: string | null | undefined,
  options?: Pick<VoiceConnectionTestOptions, "DoubaoWebSocket">,
): Promise<ConnectionTestResult> {
  const endpointSummary = `${settings.providerId} · ${settings.region}`;
  const appId = settings.appId?.trim() ?? "";
  if (!hasAccessToken || !accessToken?.trim() || !appId) {
    return {
      status: "mock",
      hint: "演示模式 — 未配置豆包 App ID 或 Access Token",
      endpointSummary,
    };
  }
  const coreResult = await testDoubaoVoiceConnection(
    { appId, accessToken: accessToken.trim() },
    { WebSocket: resolveDoubaoWebSocket(options?.DoubaoWebSocket) },
  );
  return mapDoubaoCoreResultToConnectionTest(coreResult, endpointSummary);
}

export interface CompanionProviderGateOptions {
  llmFetch?: LlmConnectionFetch;
  voiceWebSocket?: WebSocketConstructor;
  doubaoWebSocket?: DoubaoWebSocketConstructor;
}

export interface CompanionProviderGateInput {
  settings: ProviderSettingsConfig;
  llmHasKey: boolean;
  llmApiKey: string | null;
  voiceHasKey: boolean;
  voiceApiKey: string | null;
  voiceDisconnected?: boolean;
}

/** Runs ModelScope LLM + Doubao voice checks for CK-04 route gate. */
export async function verifyCompanionProviderGate(
  input: CompanionProviderGateInput,
  options: CompanionProviderGateOptions = {},
): Promise<{
  llm: ConnectionTestResult;
  voice: ConnectionTestResult;
  verification: ProviderVerificationState;
}> {
  const llm = await testLlmConnection(input.settings.llm, {
    hasKey: input.llmHasKey,
    apiKey: input.llmApiKey,
    fetch: options.llmFetch,
  });

  const voice =
    input.settings.voice.providerId === "doubao-volc" ||
    input.settings.voice.providerId === "volc-realtime"
      ? await testDoubaoVoiceConnectionFromSettings(
          input.settings.voice,
          input.voiceHasKey,
          input.voiceApiKey,
          { DoubaoWebSocket: resolveDoubaoWebSocket(options.doubaoWebSocket) },
        )
      : await testVoiceConnection(
          input.settings.voice,
          input.voiceHasKey,
          input.voiceDisconnected ?? false,
          { apiKey: input.voiceApiKey, WebSocket: options.voiceWebSocket },
        );

  const verification = evaluateProviderGateResults(llm, voice);
  return { llm, voice, verification };
}

export async function testVoiceConnection(
  settings: VoiceProviderConfig,
  hasKey: boolean,
  voiceDisconnected: boolean,
  options?: VoiceConnectionTestOptions,
): Promise<ConnectionTestResult> {
  if (
    settings.providerId === "doubao-volc" ||
    settings.providerId === "volc-realtime"
  ) {
    return testDoubaoVoiceConnectionFromSettings(
      settings,
      hasKey,
      options?.apiKey,
      { DoubaoWebSocket: resolveDoubaoWebSocket(options?.DoubaoWebSocket) },
    );
  }

  return testRealtimeVoiceTransport(
    settings,
    hasKey,
    options?.apiKey,
    voiceDisconnected,
    { WebSocket: options?.WebSocket },
  );
}

export function testRadarConnection(settings: RadarSourceConfig): ConnectionTestResult {
  const fixtureOnly =
    settings.enabledSources.length === 0 ||
    settings.enabledSources.every((s) => s === "fixture");
  if (fixtureOnly) {
    return {
      status: "mock",
      hint: "演示模式 — 使用 fixture 数据源",
      endpointSummary: "fixture",
    };
  }
  return {
    status: "degraded",
    code: "RadarRuntimeCheckRequired",
    hint: "已配置数据源 — 将在今日入口刷新时执行真实抓取/降级判断",
    endpointSummary: settings.enabledSources.join(", "),
  };
}

export function testTokenExchangeConnection(
  settings: TokenExchangeConfig,
): ConnectionTestResult {
  if (!settings.baseUrl.trim()) {
    return {
      status: "mock",
      code: "TokenExchangeNotRequired",
      hint: "个人 BYOK 模式不需要 Token BFF",
    };
  }
  const validation = validateProviderHttpsUrl(settings.baseUrl);
  if (!validation.ok) {
    return {
      status: "error",
      code: validation.code ?? "TokenExchangeError",
      hint: validation.hint ?? "URL 无效",
    };
  }
  return {
    status: "mock",
    code: "TokenExchangeNotRequired",
    hint: "个人 BYOK 模式不需要 Token BFF — mock transport 仅用于无 Key 降级",
    endpointSummary: settings.baseUrl,
  };
}

export function testExecutionApiConnection(
  settings: ExecutionApiConfig,
): ConnectionTestResult {
  if (!settings.enabled) {
    return {
      status: "mock",
      code: "ExecutionApiDisabled",
      hint: "Execution API 已关闭（默认）",
    };
  }
  if (!settings.baseUrl.trim()) {
    return {
      status: "error",
      code: "ExecutionApiConfigError",
      hint: "请填写 Execution API base URL",
    };
  }
  const validation = validateProviderHttpsUrl(settings.baseUrl);
  if (!validation.ok) {
    return {
      status: "error",
      code: validation.code ?? "ExecutionApiConfigError",
      hint: validation.hint ?? "URL 无效",
    };
  }
  return {
    status: "degraded",
    code: "ExecutionApiHealthCheckPending",
    hint: "配置有效 — 尚未执行真实健康检查，不执行远端写",
    endpointSummary: settings.baseUrl,
  };
}
