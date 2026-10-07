import { Platform } from "react-native";
import { getProviderHttpNative } from "../modules/provider-http";

export interface HttpRequest { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }
export interface HttpStream { status: number; chunks: AsyncIterable<Uint8Array>; close(): void }
export function base64Bytes(data: string): Uint8Array {
  const raw = atob(data);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
export function utf8Text(bytes: Uint8Array): string {
  // RN 0.76 does not guarantee TextDecoder. URI decoding preserves UTF-8 without a new dependency.
  let escaped = "";
  for (const value of bytes) escaped += `%${value.toString(16).padStart(2, "0")}`;
  return decodeURIComponent(escaped);
}
export async function providerHttpStream(url: string, request: HttpRequest): Promise<HttpStream> {
  if (request.signal?.aborted) throw new Error("请求已取消");
  if (Platform.OS !== "android" || (typeof process !== "undefined" && process.env.VITEST)) {
    const response = await globalThis.fetch(url, { ...request, redirect: "error" });
    return { status: response.status, close() {}, chunks: (async function* () { yield new Uint8Array(await response.arrayBuffer()); })() };
  }
  const native = await getProviderHttpNative();
  if (request.signal?.aborted) throw new Error("请求已取消");
  const id = `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const queue: Uint8Array[] = [];
  let done = false;
  let error: Error | null = null;
  let wake: (() => void) | undefined;
  let headerResolve!: (status: number) => void;
  let headerReject!: (error: Error) => void;
  const headersReady = new Promise<number>((resolve, reject) => { headerResolve = resolve; headerReject = reject; });
  const subscription = native.addListener("ProviderResponse", (event) => {
    if (event.id !== id || done) return;
    if (event.type === "headers") headerResolve(event.status ?? 0);
    if (event.type === "chunk" && event.data) queue.push(base64Bytes(event.data));
    if (event.type === "end") done = true;
    if (event.type === "error") { error = new Error("网络请求失败"); done = true; headerReject(error); }
    wake?.();
  });
  const cancel = () => { done = true; error = new Error("请求已取消"); queue.length = 0; native.cancel(id); headerReject(error); wake?.(); };
  request.signal?.addEventListener("abort", cancel, { once: true });
  const close = () => { if (!done) cancel(); subscription.remove(); request.signal?.removeEventListener("abort", cancel); };
  void native.request(id, url, request.method, request.headers, request.body ?? null).catch(() => {
    error = new Error("网络请求失败"); done = true; headerReject(error); wake?.();
  });
  let status: number;
  try { status = await headersReady; } catch (failure) { close(); throw failure; }
  return { status, close, chunks: (async function* () {
    try {
      while (!done || queue.length) {
        if (error) throw error;
        if (queue.length) yield queue.shift()!;
        else await new Promise<void>((resolve) => { wake = resolve; });
      }
      if (error) throw error;
    } finally { close(); }
  })() };
}
export async function providerFetch(url: string, request: HttpRequest) {
  // Unit fixtures use their explicit fetch; production Android gets redirect-safe native transport.
  if (typeof process !== "undefined" && process.env.VITEST) return globalThis.fetch(url, { ...request, redirect: "error" });
  const response = await providerHttpStream(url, request);
  const parts: Uint8Array[] = [];
  let length = 0;
  for await (const part of response.chunks) { parts.push(part); length += part.length; }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  const text = utf8Text(bytes);
  return { ok: response.status >= 200 && response.status < 300, status: response.status, url, text: async () => text, json: async (): Promise<unknown> => JSON.parse(text) };
}
export function providerFetchWithSignal(signal: AbortSignal) {
  return async (url: string, request: HttpRequest) => {
    const linked = new AbortController(); const abort = () => linked.abort();
    const sources = [signal, request.signal].filter((source): source is AbortSignal => Boolean(source));
    sources.forEach((source) => { if (source.aborted) abort(); else source.addEventListener("abort", abort, { once: true }); });
    try { return await providerFetch(url, { ...request, signal: linked.signal }); }
    finally { sources.forEach((source) => source.removeEventListener("abort", abort)); }
  };
}
