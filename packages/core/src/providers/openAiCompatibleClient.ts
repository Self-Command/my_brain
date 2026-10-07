import {
  LlmProviderError,
  mapHttpStatusToErrorCode,
  type LlmProviderErrorCode,
} from "./llmErrors.js";

export type LlmFetch = (
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

export interface OpenAiCompatibleMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAiCompatibleClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch: LlmFetch;
}

export interface OpenAiCompatibleCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface OpenAiCompatibleCompletionResult {
  text: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))
  );
}

function toNetworkError(error: unknown): LlmProviderError {
  if (error instanceof LlmProviderError) {
    return error;
  }
  if (isAbortError(error)) {
    return new LlmProviderError("NETWORK_ERROR", "LLM request timed out or was aborted");
  }
  const message = error instanceof Error ? error.message : "LLM network request failed";
  return new LlmProviderError("NETWORK_ERROR", message);
}

export async function createOpenAiCompatibleCompletion(
  config: OpenAiCompatibleClientConfig,
  messages: OpenAiCompatibleMessage[],
  options: OpenAiCompatibleCompletionOptions = {},
): Promise<OpenAiCompatibleCompletionResult> {
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new LlmProviderError("MISSING_API_KEY", "LLM API key is missing");
  }

  const url = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const signal = controller.signal;

  try {
    const response = await config.fetch(url, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 1024,
      }),
    });

    if (!response.ok) {
      const code = mapHttpStatusToErrorCode(response.status);
      throw new LlmProviderError(
        code,
        `OpenAI-compatible LLM request failed: HTTP ${response.status}`,
        response.status,
      );
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw new LlmProviderError("EMPTY_RESPONSE", "OpenAI-compatible LLM returned empty completion");
    }

    return { text };
  } catch (error) {
    throw toNetworkError(error);
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function hasLlmApiKey(apiKey: string | undefined | null): boolean {
  return Boolean(apiKey?.trim());
}

export type { LlmProviderErrorCode };
