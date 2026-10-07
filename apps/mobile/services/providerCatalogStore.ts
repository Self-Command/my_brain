import { fetchModelCatalog, normalizeServiceBaseUrl, type ModelCatalog, type ServiceProfile } from "@my-brain/core";
import { getStorageSession } from "../storage/storageSession";
import { getSecureCredentialStore } from "./secureCredentialStore";
import { providerFetch } from "./providerHttp";
const CACHE_KEY = "provider.catalog.v2";
interface CacheEntry { scope: string; catalog: ModelCatalog }
export function catalogScope(profile: ServiceProfile): string {
  return JSON.stringify([profile.id, profile.adapterId, normalizeServiceBaseUrl(profile.baseUrl), profile.credentialRevision]);
}
function readCache(): CacheEntry[] {
  try { return JSON.parse(getStorageSession()?.storage.getMeta(CACHE_KEY) ?? "[]") as CacheEntry[]; } catch { return []; }
}
export function cachedCatalog(profile: ServiceProfile): ModelCatalog | null {
  const entry = readCache().find((item) => item.scope === catalogScope(profile));
  return entry && Date.now() - Date.parse(entry.catalog.fetchedAt) < 86_400_000 ? entry.catalog : null;
}
export async function discoverModels(profile: ServiceProfile, signal: AbortSignal): Promise<ModelCatalog> {
  const key = await getSecureCredentialStore().get(profile.credentialRef);
  if (!key) throw new Error("保存 API Key 后自动获取目录，也可以直接手填模型");
  const scope = catalogScope(profile);
  const result = await fetchModelCatalog(profile, key, providerFetch, signal);
  if (signal.aborted) throw new Error("查询已取消");
  const entries = [{ scope, catalog: result }, ...readCache().filter((item) => item.scope !== scope)].slice(0, 8);
  getStorageSession()?.storage.setMeta(CACHE_KEY, JSON.stringify(entries));
  return result;
}
