import { normalizeServiceBaseUrl, type ServiceProfile } from "./serviceConfig.js";

export interface CatalogEntry { id: string; name: string; owner?: string }
export interface CatalogResponse { ok: boolean; status: number; url?: string; json(): Promise<unknown> }
export type CatalogFetch = (url: string, init: { method: string; headers: Record<string, string>; signal?: AbortSignal; redirect?: "error" }) => Promise<CatalogResponse>;
export interface ModelCatalog { entries: CatalogEntry[]; complete: boolean; fetchedAt: string }

export class CatalogError extends Error {
  constructor(public readonly code: "UNAUTHORIZED" | "UNSUPPORTED" | "RATE_LIMITED" | "NETWORK_ERROR" | "INVALID_RESPONSE", message: string) { super(message); }
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
export async function fetchModelCatalog(profile: ServiceProfile, key: string, fetch: CatalogFetch, signal: AbortSignal): Promise<ModelCatalog> {
  if (profile.role === "realtime") throw new CatalogError("UNSUPPORTED", "该实时服务未公开模型目录，请手填模型版本");
  const base = normalizeServiceBaseUrl(profile.baseUrl);
  const origin = new URL(base).origin;
  const seen = new Set<string>();
  const entries = new Map<string, CatalogEntry>();
  let next: string | null = `${base}/models`;
  const started = Date.now();
  for (let page = 0; next && page < 50; page++) {
    if (signal.aborted) throw new Error("目录查询已取消");
    if (seen.has(next)) throw new CatalogError("INVALID_RESPONSE", "目录分页循环");
    if (new URL(next).origin !== origin) throw new CatalogError("INVALID_RESPONSE", "拒绝跨域目录链接");
    seen.add(next);
    const currentUrl: string = next;
    const response = await fetch(currentUrl, { method: "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal, redirect: "error" });
    if (response.url && new URL(response.url).origin !== origin) throw new CatalogError("INVALID_RESPONSE", "拒绝跨域目录响应");
    if (!response.ok) {
      const code = response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : response.status === 404 ? "UNSUPPORTED" : response.status === 429 ? "RATE_LIMITED" : "NETWORK_ERROR";
      throw new CatalogError(code, `模型目录请求失败 (${response.status})，仍可手填模型并单独验证`);
    }
    const body = record(await response.json());
    if (!body || !Array.isArray(body.data)) throw new CatalogError("INVALID_RESPONSE", "目录返回格式不兼容");
    for (const raw of body.data) {
      const model = record(raw);
      if (typeof model?.id !== "string" || !model.id.trim()) continue;
      entries.set(model.id, { id: model.id, name: typeof model.name === "string" ? model.name : typeof model.display_name === "string" ? model.display_name : model.id, owner: typeof model.owned_by === "string" ? model.owned_by : undefined });
    }
    const link = body.next ?? record(body.links)?.next;
    next = typeof link === "string" && link ? new URL(link, currentUrl).toString() : null;
    if (next && new URL(next).origin !== origin) throw new CatalogError("INVALID_RESPONSE", "拒绝跨域目录链接");
    if (entries.size >= 5000 || Date.now() - started > 60_000 || (body.has_more === true && !next)) {
      return { entries: [...entries.values()], complete: false, fetchedAt: new Date().toISOString() };
    }
  }
  return { entries: [...entries.values()].sort((a, b) => a.name.localeCompare(b.name)), complete: next === null, fetchedAt: new Date().toISOString() };
}
