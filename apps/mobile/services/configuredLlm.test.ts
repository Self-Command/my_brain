import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestStorageSession } from "../storage/testStorageSession";
import { setStorageSession } from "../storage/storageSession";
import { getSecureCredentialStore, resetSecureCredentialStoreForTests } from "./secureCredentialStore";
import { activeProfile, migrateProviderProfiles, updateServiceProfile } from "./providerProfiles";
import { completeConfiguredChat, resolveConfiguredLlm } from "./configuredLlm";
let session: ReturnType<typeof createTestStorageSession>;
beforeEach(() => { session = createTestStorageSession(":memory:"); session.storage.migrate(); setStorageSession(session); resetSecureCredentialStoreForTests(); });
afterEach(() => { setStorageSession(null); session.driver.close?.(); vi.unstubAllGlobals(); });
async function configure() {
  const credentials = getSecureCredentialStore(); const settings = await migrateProviderProfiles(credentials);
  updateServiceProfile({ ...activeProfile(settings, "llm")!, baseUrl: "https://example.com/custom/v1", modelId: "selected-custom-model" });
  await credentials.set("llm_api_key", "fixture-selected-key");
}
describe("business LLM configuration", () => {
  it("sends explanation and casual chat through the same explicit selected configuration", async () => {
    await configure(); const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ choices: [{ message: { content: "selected reply" } }] })));
    vi.stubGlobal("fetch", fetch);
    expect(await (await resolveConfiguredLlm()).explain("AI", "original context")).toBe("selected reply");
    expect(await completeConfiguredChat([{ role: "user", content: "你好" }], new AbortController().signal)).toBe("selected reply");
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe("https://example.com/custom/v1/chat/completions");
      expect(JSON.parse(String(init?.body)).model).toBe("selected-custom-model");
      expect(init?.headers).toMatchObject({ Authorization: "Bearer fixture-selected-key" });
    }
  });
  it("propagates permission failures and never substitutes a mock response", async () => {
    await configure(); vi.stubGlobal("fetch", vi.fn(async () => new Response("do not expose this body", { status: 401 })));
    await expect((await resolveConfiguredLlm()).explain("AI")).rejects.toThrow();
    await expect(completeConfiguredChat([{ role: "user", content: "你好" }], new AbortController().signal)).rejects.toThrow();
  });
});
