import { appendCasualTurn, createConfiguredLlmProvider, createOpenAiCompatibleCompletion, hasExplicitSaveIntent, hasRejectMemoryIntent, normalizeServiceBaseUrl, rejectEphemeralMemory, type EphemeralConversationState, type OpenAiCompatibleMessage } from "@my-brain/core";
import { loadProviderSettings } from "./providerConfigStore";
import { getSecureCredentialStore } from "./secureCredentialStore";
import { providerFetch } from "./providerHttp";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { useProvisionalStore } from "../stores/provisionalStore";
import { activeProfile, loadProviderProfiles } from "./providerProfiles";
function llmSnapshot() {
  const profiles = loadProviderProfiles();
  const profile = profiles ? activeProfile(profiles, "llm") : undefined;
  return { settings: loadProviderSettings().llm, profile };
}
function assertCurrent(snapshot: ReturnType<typeof llmSnapshot>) {
  if (!snapshot.profile) return;
  const settings = loadProviderProfiles();
  const current = settings ? activeProfile(settings, "llm") : undefined;
  if (current?.id !== snapshot.profile.id || current.configRevision !== snapshot.profile.configRevision || current.credentialRevision !== snapshot.profile.credentialRevision) throw new Error("服务配置已改变，请重新发送");
}

export async function resolveConfiguredLlm(signal?: AbortSignal) {
  const snapshot = llmSnapshot(); const { settings } = snapshot;
  const key = await getSecureCredentialStore().get(snapshot.profile?.credentialRef ?? "llm_api_key");
  assertCurrent(snapshot);
  if (!key) throw new Error("语言模型未配置密钥");
  return createConfiguredLlmProvider(settings, key, async (url, request) => {
    assertCurrent(snapshot);
    const linked = new AbortController();
    const sources = [signal, request.signal].filter((source): source is AbortSignal => Boolean(source));
    const abort = () => linked.abort();
    sources.forEach((source) => { if (source.aborted) abort(); else source.addEventListener("abort", abort, { once: true }); });
    try { return await providerFetch(url, { ...request, signal: linked.signal }); }
    finally { sources.forEach((source) => source.removeEventListener("abort", abort)); }
  });
}
export async function completeConfiguredChat(messages: OpenAiCompatibleMessage[], signal: AbortSignal): Promise<string> {
  const snapshot = llmSnapshot(); const { settings } = snapshot;
  const key = await getSecureCredentialStore().get(snapshot.profile?.credentialRef ?? "llm_api_key");
  assertCurrent(snapshot);
  if (!key || !settings.model.trim() || !settings.endpoint.trim()) throw new Error("请先配置语言模型");
  const { text } = await createOpenAiCompatibleCompletion({ baseUrl: normalizeServiceBaseUrl(settings.endpoint), model: settings.model.trim(), apiKey: key.trim(), fetch: providerFetch }, messages, { signal });
  assertCurrent(snapshot);
  return text;
}
export function mobileChatMessages(chat: EphemeralConversationState, text: string): OpenAiCompatibleMessage[] {
  return [{ role: "system", content: "你是 my_brain 的中文语音知识伴侣。用简短自然的话回复，技术名词保留英文。闲聊不自动入库；只有用户明确要求保存才生成待确认候选。你不能声称已经创建、合并或删除知识节点。" },
    ...(chat.contextSummary ? [{ role: "system" as const, content: chat.contextSummary }] : []),
    ...chat.turns.map((turn) => ({ role: turn.role, content: turn.text })), { role: "user", content: text }];
}
export async function replyToVoiceChat(text: string, signal: AbortSignal): Promise<string> {
  const store = useMobileAppStore.getState();
  if (!store.ephemeralChat) store.startEphemeralChat();
  const chat = useMobileAppStore.getState().ephemeralChat;
  if (!chat) throw new Error("临时会话未就绪");
  if (hasRejectMemoryIntent(text)) { store.setEphemeralChat(rejectEphemeralMemory(chat)); return "这轮闲聊不会写入永久图谱。"; }
  if (hasExplicitSaveIntent(text)) {
    const candidate = useProvisionalStore.getState().addChatSaveCandidate(chat, text);
    return `已生成待确认候选「${candidate.summary.slice(0, 32)}」，确认后才入库。`;
  }
  const reply = await completeConfiguredChat(mobileChatMessages(chat, text), signal);
  if (signal.aborted) return "";
  const current = useMobileAppStore.getState().ephemeralChat;
  if (current?.sessionId !== chat.sessionId) return "";
  const next = appendCasualTurn(current, text).state;
  next.turns[next.turns.length - 1] = { role: "assistant", text: reply, atMs: Date.now() };
  store.setEphemeralChat(next);
  return reply;
}
