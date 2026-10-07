export interface ProviderHttpEvent { id: string; type: "headers" | "chunk" | "end" | "error"; status?: number; data?: string }
export interface ProviderHttpNative {
  request(id: string, url: string, method: string, headers: Record<string, string>, body: string | null): Promise<void>;
  cancel(id: string): void;
  addListener(event: "ProviderResponse", listener: (event: ProviderHttpEvent) => void): { remove(): void };
}
export async function getProviderHttpNative(): Promise<ProviderHttpNative> {
  const { requireNativeModule } = await import("expo-modules-core");
  return requireNativeModule<ProviderHttpNative>("ProviderHttp");
}
