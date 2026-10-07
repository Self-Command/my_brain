import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createConfiguredLlmProvider, isProfileVerified, MIMO_VOICE_PRESETS, normalizeServiceBaseUrl, type ModelCatalog, type ProviderSettingsV2, type ServiceProfile } from "@my-brain/core";
import { activeProfile, loadProviderProfiles, migrateProviderProfiles, profileReadiness, recordProfileVerification, saveProviderProfiles, subscribeProviderProfiles, updateServiceProfile } from "../../services/providerProfiles";
import { cachedCatalog, discoverModels } from "../../services/providerCatalogStore";
import { getSecureCredentialStore, maskCredentialLast4 } from "../../services/secureCredentialStore";
import { providerFetchWithSignal } from "../../services/providerHttp";
import { testDoubaoVoiceConnectionFromSettings } from "../../services/providerConfigStore";
import { useMobileAppStore } from "../../stores/mobileAppStore";
import { createTtsPlayback } from "../../voice/ttsPlayback";
import { disconnectActiveVoiceSession } from "../../voice/voiceAppLifecycle";
import { useTheme } from "../../theme/ThemeProvider";
import { spacing } from "../../theme/tokens";

function syncApp() {
  const settings = loadProviderProfiles();
  if (!settings) return;
  useMobileAppStore.getState().applyProviderVerification(profileReadiness(settings));
  const profile = activeProfile(settings, "llm");
  if (!profile) return;
  void getSecureCredentialStore().has(profile.credentialRef).then((hasApiKey) => {
    const current = loadProviderProfiles(); const active = current ? activeProfile(current, "llm") : undefined;
    if (!current || active?.id !== profile.id || active.credentialRevision !== profile.credentialRevision) return;
    useMobileAppStore.setState({ hasApiKey });
    useMobileAppStore.getState().applyProviderVerification(profileReadiness(current));
  }).catch(() => undefined);
}
function newProfile(role: "llm" | "tts" | "realtime", preset: "custom" | "mimo" = "custom"): ServiceProfile {
  const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, role, displayName: preset === "mimo" ? "MiMo" : role === "llm" ? "自定义语言模型" : "自定义 TTS",
    adapterId: role === "llm" ? "openai-chat-completions" : preset === "mimo" ? "chat-completions-audio" : "openai-audio-speech",
    baseUrl: preset === "mimo" ? "https://api.xiaomimimo.com/v1" : "", modelId: "", voiceId: "", credentialRef: `profile.${id}`, configRevision: 1, credentialRevision: 0 };
}
export function UniversalProviderSettings() {
  const [settings, setSettings] = useState(loadProviderProfiles);
  const [error, setError] = useState("");
  const [voiceRole, setVoiceRole] = useState<"tts" | "realtime">(settings?.voiceSelection.mode === "composed" ? "tts" : "realtime");
  const [editingLlm, setEditingLlm] = useState<string | null>(null);
  const [editingVoice, setEditingVoice] = useState<string | null>(null);
  const { colors } = useTheme();
  useEffect(() => {
    const unsubscribe = subscribeProviderProfiles(() => { setSettings(loadProviderProfiles()); syncApp(); });
    void migrateProviderProfiles(getSecureCredentialStore()).then(setSettings).catch((failure: unknown) => setError(failure instanceof Error ? failure.message : "迁移失败"));
    return unsubscribe;
  }, []);
  const add = (role: "llm" | "tts", preset: "custom" | "mimo" = "custom") => {
    if (!settings) return;
    const profile = newProfile(role, preset);
    saveProviderProfiles({ ...settings, profiles: [...settings.profiles, profile] });
    if (role === "llm") setEditingLlm(profile.id); else { setVoiceRole("tts"); setEditingVoice(profile.id); }
  };
  if (!settings) return <Text style={{ color: colors.error }}>{error || "正在安全迁移服务配置…"}</Text>;
  const llm = settings.profiles.find((p) => p.id === editingLlm && p.role === "llm") ?? activeProfile(settings, "llm");
  const voice = settings.profiles.find((p) => p.id === editingVoice && p.role === voiceRole)
    ?? settings.profiles.find((p) => p.role === voiceRole && p.id === activeProfile(settings, "voice")?.id)
    ?? settings.profiles.find((p) => p.role === voiceRole);
  return <View style={styles.root} testID="universal-provider-settings">
    <Text style={[styles.title, { color: colors.text }]}>语言模型 · OpenAI 兼容</Text>
    <View style={styles.row}>{settings.profiles.filter((p) => p.role === "llm").map((p) => <Pressable key={p.id} onPress={() => setEditingLlm(p.id)}><Text style={{ color: colors.primary }}>{p.displayName}{p.id === settings.activeLlmProfileId ? " · 已选用" : ""}</Text></Pressable>)}</View>
    <Pressable onPress={() => add("llm")} testID="provider-add-llm"><Text style={{ color: colors.primary }}>新增语言模型配置</Text></Pressable>
    {llm ? <ProfileEditor key={llm.id} profile={llm} settings={settings} onCandidate={(id, notice) => { setEditingLlm(id); setError(notice); }} /> : null}
    <Text style={[styles.title, { color: colors.text }]}>语音模式</Text>
    <Text style={{ color: colors.textSecondary }}>豆包实时会话使用豆包自身回复；组合模式使用所选 LLM 和 TTS。</Text>
    <View style={styles.row}>
      <Pressable onPress={() => { setVoiceRole("realtime"); setEditingVoice(null); }} testID="provider-mode-realtime"><Text style={{ color: colors.primary }}>豆包实时会话</Text></Pressable>
      <Pressable onPress={() => { setVoiceRole("tts"); setEditingVoice(null); }} testID="provider-mode-composed"><Text style={{ color: colors.primary }}>设备识别 + LLM + TTS</Text></Pressable>
    </View>
    {voiceRole === "tts" ? <View style={styles.row}>
      <Pressable onPress={() => add("tts", "mimo")} testID="provider-add-mimo"><Text style={{ color: colors.primary }}>新增 MiMo 预设</Text></Pressable>
      <Pressable onPress={() => add("tts")} testID="provider-add-tts"><Text style={{ color: colors.primary }}>新增通用 TTS</Text></Pressable>
    </View> : null}
    <View style={styles.row}>{settings.profiles.filter((p) => p.role === voiceRole).map((p) => <Pressable key={p.id} onPress={() => setEditingVoice(p.id)}><Text style={{ color: colors.primary }}>{p.displayName}{p.id === activeProfile(settings, "voice")?.id ? " · 已选用" : ""}</Text></Pressable>)}</View>
    {voice ? <ProfileEditor key={voice.id} profile={voice} settings={settings} onCandidate={(id, notice) => { setEditingVoice(id); setError(notice); }} /> : <Text style={{ color: colors.textSecondary }}>先新增一份 TTS 配置；原豆包仍保留。</Text>}
    {error ? <Text style={{ color: colors.textSecondary }} accessibilityLiveRegion="polite">{error}</Text> : null}
    <Text style={{ color: colors.warning }}>测试版：真机打断时延、回声、蓝牙、来电和 iOS 尚未验收。</Text>
  </View>;
}
function ProfileEditor({ profile, settings, onCandidate }: { profile: ServiceProfile; settings: ProviderSettingsV2; onCandidate(id: string, notice: string): void }) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(profile);
  const [keyDraft, setKeyDraft] = useState("");
  const [last4, setLast4] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const epoch = useRef(0);
  const preview = useRef<ReturnType<typeof createTtsPlayback> | null>(null);
  const verificationAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { setDraft(profile); }, [profile.configRevision, profile.credentialRevision]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; verificationAbort.current?.abort(); preview.current?.stop(); }; }, []);
  useEffect(() => {
    void getSecureCredentialStore().getLast4(profile.credentialRef).then((value) => { if (mounted.current) setLast4(value); });
    if (profile.role === "realtime" || !profile.baseUrl.trim()) return;
    const generation = ++epoch.current;
    const controller = new AbortController();
    try { const cached = cachedCatalog(profile); setCatalog(cached); setFromCache(Boolean(cached)); } catch { setCatalog(null); setFromCache(false); }
    const timer = setTimeout(() => {
      if (generation !== epoch.current) return;
      setMessage("正在获取模型目录…");
      const timeout = setTimeout(() => controller.abort(), 20_000);
      void discoverModels(profile, controller.signal).then((result) => {
        if (generation !== epoch.current || controller.signal.aborted) return;
        setCatalog(result); setFromCache(false); setMessage(result.complete ? "模型目录已获取；请选择模型或手填 ID，调用权限仍需验证。" : "目录不完整，仍可手填模型 ID。");
      }).catch((failure: unknown) => {
        if (generation === epoch.current) setMessage(controller.signal.aborted ? "目录查询已取消或超时，可重试或手填" : failure instanceof Error ? failure.message : "目录查询失败，可手填");
      }).finally(() => clearTimeout(timeout));
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); epoch.current++; };
  }, [profile.id, profile.baseUrl, profile.adapterId, profile.credentialRevision, refresh]);
  const field = (name: keyof ServiceProfile, label: string, testID: string) => <TextInput editable={!busy} testID={testID} value={String(draft[name] ?? "")} onChangeText={(value) => setDraft((p) => ({ ...p, [name]: value }))} autoCapitalize="none" placeholder={label} placeholderTextColor={colors.textTertiary} accessibilityLabel={label} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />;
  const save = async (): Promise<ServiceProfile> => {
    if (draft.role !== "realtime") normalizeServiceBaseUrl(draft.baseUrl);
    const current = loadProviderProfiles();
    if (!current) throw new Error("配置尚未初始化");
    const previous = current.profiles.find((p) => p.id === draft.id);
    const active = activeProfile(current, draft.role === "llm" ? "llm" : "voice");
    let candidate = draft;
    if (previous && active?.id === previous.id && isProfileVerified(previous, current.verification)) {
      if (JSON.stringify(draft) === JSON.stringify(previous) && !keyDraft.trim()) return previous;
      // Keep the enabled profile and its secret intact until the edited candidate passes.
      const id = `${draft.role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      candidate = { ...draft, id, displayName: `${draft.displayName}（新配置）`, credentialRef: `profile.${id}`, configRevision: 1, credentialRevision: 0 };
    }
    const next = updateServiceProfile(candidate);
    const credentials = getSecureCredentialStore();
    const value = keyDraft.trim() || (candidate.id !== draft.id ? await credentials.get(draft.credentialRef) : null);
    if (value) { await credentials.set(candidate.credentialRef, value); setKeyDraft(""); }
    const saved = loadProviderProfiles()?.profiles.find((p) => p.id === candidate.id) ?? next.profiles.find((p) => p.id === candidate.id)!;
    setDraft(saved); return saved;
  };
  const verify = async () => {
    setBusy(true); disconnectActiveVoiceSession();
    verificationAbort.current?.abort(); const operation = new AbortController(); verificationAbort.current = operation;
    let saved: ServiceProfile | undefined;
    let notice = "验证失败，可修正配置后重试";
    try {
      saved = await save();
      const key = await getSecureCredentialStore().get(saved.credentialRef);
      let live = false;
      if (saved.role === "llm") {
        const result = await createConfiguredLlmProvider({ endpoint: saved.baseUrl, model: saved.modelId }, key ?? "", providerFetchWithSignal(operation.signal)).testConnection();
        live = result.status === "connected";
        if (!live) throw new Error(result.errorCode ?? "语言模型调用失败");
      } else if (saved.role === "realtime") {
        const result = await testDoubaoVoiceConnectionFromSettings({ providerId: "doubao-volc", voiceModel: saved.modelId, region: saved.region ?? "cn-north", appId: saved.appId }, Boolean(key), key);
        live = result.status === "live";
        if (!live) throw new Error(result.hint ?? "豆包连接失败");
      } else {
        preview.current = createTtsPlayback(saved);
        await preview.current.play("你好，语音配置测试。你可以随时停止播放。");
        live = true;
      }
      if (!mounted.current || operation.signal.aborted) return;
      recordProfileVerification(saved, live); notice = "验证成功，可启用此配置。真机性能仍待验收。"; setMessage(notice);
    } catch (failure) {
      if (saved && mounted.current && !operation.signal.aborted) recordProfileVerification(saved, false);
      notice = failure instanceof Error ? failure.message : "验证失败";
      if (mounted.current) setMessage(notice);
    } finally { if (mounted.current) { setBusy(false); if (saved?.id !== profile.id && saved) onCandidate(saved.id, notice); } }
  };
  const activate = () => {
    const current = loadProviderProfiles();
    const saved = current?.profiles.find((p) => p.id === profile.id);
    if (!current || !saved || !isProfileVerified(saved, current.verification)) { setMessage("请先保存并验证此配置"); return; }
    disconnectActiveVoiceSession();
    saveProviderProfiles(saved.role === "llm" ? { ...current, activeLlmProfileId: saved.id }
      : { ...current, voiceSelection: saved.role === "realtime" ? { mode: "realtime", realtimeProfileId: saved.id } : { mode: "composed", ttsProfileId: saved.id } });
    setMessage("已启用此配置");
  };
  const verified = isProfileVerified(profile, settings.verification);
  return <View style={styles.editor} testID={`provider-editor-${profile.role}`}>
    {field("displayName", "配置名称", `provider-${profile.role}-name`)}
    {profile.role !== "realtime" ? field("baseUrl", "API Base URL，例如 https://服务地址/v1", `provider-${profile.role}-endpoint`) : null}
    {profile.role === "tts" ? <View style={styles.row}>{(["openai-audio-speech", "chat-completions-audio"] as const).map((adapterId) => <Pressable key={adapterId} onPress={() => setDraft((p) => ({ ...p, adapterId }))}><Text style={{ color: colors.primary }}>{adapterId === "openai-audio-speech" ? "Speech 协议" : "音频 Chat 协议（MiMo）"}{draft.adapterId === adapterId ? " ✓" : ""}</Text></Pressable>)}</View> : null}
    {field("modelId", profile.role === "realtime" ? "豆包实时模型版本" : "模型 ID（可手动填写）", `provider-${profile.role}-model`)}
    {profile.role !== "realtime" ? <>
      <TextInput testID={`provider-${profile.role}-model-search`} value={query} onChangeText={setQuery} placeholder="搜索模型 ID / 名称 / 所属方" placeholderTextColor={colors.textTertiary} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
      <Pressable onPress={() => setRefresh((value) => value + 1)}><Text style={{ color: colors.primary }}>刷新模型目录</Text></Pressable>
      {catalog ? <Text style={{ color: colors.textSecondary }}>目录时间：{catalog.fetchedAt} · {fromCache ? "缓存" : "接口获取"} · {catalog.complete ? "完整目录" : "部分目录"}</Text> : null}
      {catalog?.entries.length === 0 ? <Text style={{ color: colors.textSecondary }}>接口返回空目录，仍可手动填写模型 ID。</Text> : null}
      {catalog && draft.modelId && !catalog.entries.some((item) => item.id === draft.modelId) ? <Text style={{ color: colors.textSecondary }}>当前模型 ID 未出现在目录中，已保留填写值；请通过实际调用验证权限。</Text> : null}
      {catalog?.entries.filter((m) => `${m.id} ${m.name} ${m.owner ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 40).map((model) => <Pressable key={model.id} onPress={() => setDraft((p) => ({ ...p, modelId: model.id }))}><Text style={{ color: colors.text }}>{model.name} · {model.id}{/voiceclone|voicedesign/.test(model.id) ? "（本版本未支持额外参数）" : ""}</Text></Pressable>)}
    </> : <>{field("appId", "豆包 App ID", "provider-voice-app-id")}{field("region", "区域", "provider-voice-region")}</>}
    {profile.role === "tts" ? <>
      {field("voiceId", "音色 ID（可手动填写）", "provider-tts-voice")}
      {draft.adapterId === "chat-completions-audio" ? <><Text style={{ color: colors.textSecondary }}>MiMo 文档预置音色，非账号实时音色目录</Text><View style={styles.row}>{MIMO_VOICE_PRESETS.map((voiceId) => <Pressable key={voiceId} onPress={() => setDraft((p) => ({ ...p, voiceId }))}><Text style={{ color: colors.primary }}>{voiceId}</Text></Pressable>)}</View>{field("style", "声音风格（可选）", "provider-tts-style")}</> : <Text style={{ color: colors.textSecondary }}>该协议无通用音色目录，请填写服务商支持的音色 ID。</Text>}
    </> : null}
    <Text style={{ color: colors.textSecondary }} testID={`provider-${profile.role}-key-mask`}>Key：{maskCredentialLast4(last4)} · {verified ? "调用已验证" : "尚未验证"}</Text>
    <TextInput value={keyDraft} onChangeText={setKeyDraft} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="填写 Key / Token，仅存本机安全存储" placeholderTextColor={colors.textTertiary} testID={`provider-${profile.role}-key-input`} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
    <View style={styles.row}>
      <Pressable disabled={busy} testID={`provider-${profile.role}-save`} onPress={() => { void save().then((saved) => {
        const notice = "配置已保存，目录将自动获取，实际调用需验证";
        setMessage(notice); if (saved.id !== profile.id) onCandidate(saved.id, notice);
      }).catch((failure: unknown) => setMessage(failure instanceof Error ? failure.message : "保存失败")); }}><Text style={{ color: colors.primary }}>保存配置与 Key</Text></Pressable>
      <Pressable disabled={busy} testID={`test-connection-${profile.role}`} onPress={() => { void verify(); }}><Text style={{ color: colors.primary }}>{busy ? "验证中…" : profile.role === "tts" ? "试听并验证（可能计费）" : "验证连接（可能计费）"}</Text></Pressable>
      <Pressable disabled={busy} testID={`provider-${profile.role}-activate`} onPress={activate}><Text style={{ color: colors.primary }}>启用配置</Text></Pressable>
      <Pressable disabled={busy} testID={`provider-${profile.role}-clear-key`} onPress={() => {
        void getSecureCredentialStore().delete(profile.credentialRef).then(() => { setKeyDraft(""); setLast4(null); setMessage("密钥已清除，需要重新保存并验证"); }).catch(() => setMessage("密钥清除失败"));
      }}><Text style={{ color: colors.primary }}>清除密钥</Text></Pressable>
      {profile.role === "tts" ? <Pressable onPress={() => { preview.current?.stop(); setBusy(false); setMessage("试听已停止，未授予验证状态"); }}><Text style={{ color: colors.primary }}>停止试听</Text></Pressable> : null}
    </View>
    {message ? <Text style={{ color: colors.textSecondary }} accessibilityLiveRegion="polite">{message}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({ root: { gap: spacing.md }, row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md }, title: { fontSize: 18, fontWeight: "600" }, editor: { gap: spacing.sm, paddingBottom: spacing.lg }, input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.sm } });
