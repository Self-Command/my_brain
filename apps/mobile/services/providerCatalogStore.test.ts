import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestStorageSession } from "../storage/testStorageSession";
import { setStorageSession } from "../storage/storageSession";
import { activeProfile, loadProviderProfiles, migrateProviderProfiles, updateServiceProfile } from "./providerProfiles";
import { getSecureCredentialStore, resetSecureCredentialStoreForTests } from "./secureCredentialStore";
import { cachedCatalog, catalogScope, discoverModels } from "./providerCatalogStore";
import { providerFetch } from "./providerHttp";
vi.mock("./providerHttp", () => ({ providerFetch: vi.fn() }));
let session: ReturnType<typeof createTestStorageSession>;
beforeEach(() => { session = createTestStorageSession(":memory:"); session.storage.migrate(); setStorageSession(session); resetSecureCredentialStoreForTests(); });
afterEach(() => { setStorageSession(null); session.driver.close?.(); vi.resetAllMocks(); });
async function profile() {
  const credentials = getSecureCredentialStore(); const settings = await migrateProviderProfiles(credentials);
  updateServiceProfile({ ...activeProfile(settings, "llm")!, baseUrl: "https://example.com/v1", modelId: "manual" });
  await credentials.set("llm_api_key", "fixture-catalog-key");
  return activeProfile(loadProviderProfiles()!, "llm")!;
}
describe("model cache scope and late results", () => {
  it("keeps manually selected models and isolates URL, key revision, protocol and profile", async () => {
    const current = await profile();
    vi.mocked(providerFetch).mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "discovered" }] })));
    await discoverModels(current, new AbortController().signal);
    expect(cachedCatalog(current)?.entries[0]?.id).toBe("discovered");
    expect(activeProfile(loadProviderProfiles()!, "llm")?.modelId).toBe("manual");
    for (const different of [{ ...current, baseUrl: "https://other.example/v1" }, { ...current, credentialRevision: current.credentialRevision + 1 }, { ...current, id: "other" }, { ...current, adapterId: "openai-audio-speech" as const }]) {
      expect(catalogScope(different)).not.toBe(catalogScope(current)); expect(cachedCatalog(different)).toBeNull();
    }
  });
  it("does not cache a late successful response after cancellation", async () => {
    const current = await profile(); const controller = new AbortController();
    vi.mocked(providerFetch).mockImplementation(async () => {
      controller.abort(); return new Response(JSON.stringify({ data: [{ id: "late" }] }));
    });
    await expect(discoverModels(current, controller.signal)).rejects.toThrow("取消");
    expect(cachedCatalog(current)).toBeNull();
  });
});
