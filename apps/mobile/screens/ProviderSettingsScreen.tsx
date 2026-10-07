import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { GlassCard } from "../components/ui/GlassCard";
import { PageHeader } from "../components/ui/PageHeader";
import { ProviderConnectionRow } from "../components/ProviderConnectionRow";
import { TestConnectionButton } from "../components/TestConnectionButton";
import { readMobileAppEnv } from "../env/readAppEnv";
import { BackButton } from "../navigation/BackButton";
import { useNavigation } from "../navigation/NavigationContext";
import {
  appendProviderConfigAudit,
  deriveProviderSnapshotFromSettings,
  loadProviderSettings,
  saveProviderSettings,
  testExecutionApiConnection,
  testRadarConnection,
  testTokenExchangeConnection,
  type ConnectionTestResult,
  type ProviderSettingsConfig,
} from "../services/providerConfigStore";
import { validateProviderHttpsUrl } from "../services/providerUrlValidation";
import { getSecureCredentialStore } from "../services/secureCredentialStore";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { UniversalProviderSettings } from "../components/providers/UniversalProviderSettings";
import { useTheme } from "../theme/ThemeProvider";
import { brainTheme, safeArea, spacing, typography } from "../theme/tokens";
import { isVisualFixtureRoute } from "../visual-fixtures/captureSession";

type BlockId = "llm" | "voice" | "radar" | "tokenExchange" | "executionApi";

export interface ProviderSettingsScreenProps {
  /** First-launch gate — opens text mode after LLM verification. */
  launchGate?: boolean;
}

export function ProviderSettingsScreen(props: ProviderSettingsScreenProps) {
  if (props.launchGate) {
    return <ProviderSettingsScreenInner {...props} onBack={() => undefined} showBack={false} />;
  }
  return <ProviderSettingsScreenWithNav {...props} />;
}

function ProviderSettingsScreenWithNav(props: ProviderSettingsScreenProps) {
  const { goBack } = useNavigation();
  return <ProviderSettingsScreenInner {...props} onBack={goBack} showBack />;
}

function ProviderSettingsScreenInner({
  launchGate = false,
  onBack,
  showBack,
}: ProviderSettingsScreenProps & { onBack: () => void; showBack: boolean }) {
  const { mode, colors } = useTheme();
  const theme = brainTheme[mode];
  const providerVisualCapture = isVisualFixtureRoute("ProviderSettings");
  const voiceDisconnected = useMobileAppStore((s) =>
    s.degraded.active.includes("voice_disconnected"),
  );

  const [settings, setSettings] = useState<ProviderSettingsConfig>(() => loadProviderSettings());
  const [results, setResults] = useState<Partial<Record<BlockId, ConnectionTestResult>>>({});

  const providerVerified = useMobileAppStore((s) => s.providerVerified);

  const shellEnv = useMemo(() => readMobileAppEnv(), []);

  const syncStoreStatus = useCallback(
    (next: ProviderSettingsConfig, hasLlm: boolean, hasVoice: boolean) => {
      const snapshot = deriveProviderSnapshotFromSettings(
        next,
        hasLlm,
        hasVoice,
        voiceDisconnected,
      );
      useMobileAppStore.setState({ hasApiKey: hasLlm, providerStatus: snapshot });
    },
    [voiceDisconnected],
  );

  const persistSettings = useCallback(
    (next: ProviderSettingsConfig, auditField: string) => {
      saveProviderSettings(next);
      setSettings(next);
      appendProviderConfigAudit(auditField, "ok", "provider_settings_saved");
      void (async () => {
        const store = getSecureCredentialStore();
        const hasLlm = await store.has("llm_api_key");
        const hasVoice = await store.has("voice_api_key");
        syncStoreStatus(next, hasLlm, hasVoice);
      })();
    },
    [syncStoreStatus],
  );

  const setResult = useCallback((block: BlockId, result: ConnectionTestResult) => {
    setResults((prev) => ({ ...prev, [block]: result }));
  }, []);

  const handleBack = useCallback(() => onBack(), [onBack]);

  const mergedTokenUrl =
    settings.tokenExchange.baseUrl.trim() ||
    shellEnv.tokenExchangeUrl ||
    "";

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background }]}
      testID={providerVisualCapture ? "screen-provider-settings" : "provider-settings-screen"}
    >
      <PageHeader
        variant={providerVisualCapture ? "contract" : "default"}
        title={providerVisualCapture || !launchGate ? "连接与模型" : "Provider Setup"}
        subtitle={
          providerVisualCapture
            ? "密钥只存本机；未测试成功前不会显示为已连接。"
            : launchGate
              ? "语言模型验证后可进入；语音未就绪时仍可使用文字"
              : "密钥、语音与智能服务"
        }
        themeMode={mode}
        leftSlot={
          showBack ? (
            <BackButton onPress={handleBack} testID="provider-settings-back" />
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} testID="provider-settings-scroll">
        {launchGate ? (
          <GlassCard themeMode={mode} testID="provider-launch-gate-banner" style={styles.banner}>
            <Text style={[styles.bannerText, { color: theme.warning }]}>
              首次启动需验证语言模型。语音单独验证，失败时可以先用文字聊聊。
            </Text>
            {providerVerified ? (
              <Text style={[styles.bannerText, { color: theme.primary, marginTop: spacing.xs }]}>
                已通过 live 检测 — 主界面已解锁。
              </Text>
            ) : null}
          </GlassCard>
        ) : null}
        <GlassCard themeMode={mode} testID="provider-settings-mock-banner" style={styles.banner}>
          <Text style={[styles.bannerText, { color: theme.warning }]}>
            {providerVisualCapture
              ? "兼容接口与豆包均可选择；测试失败不会显示「已连接」。"
              : "连接状态始终可见；部分能力为演示或降级时也会如实说明，测试失败不会显示「已连接」。"}
          </Text>
        </GlassCard>

        <UniversalProviderSettings />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>新闻与趋势</Text>
        <ProviderConnectionRow
          title="今日入口数据源"
          subtitle={`间隔 ${settings.radar.fetchIntervalMinutes} 分钟`}
          result={results.radar ?? null}
          themeMode={mode}
          testID="provider-row-radar"
        />
        <TestConnectionButton
          testID="test-connection-radar"
          themeMode={mode}
          onTest={async () => testRadarConnection(settings.radar)}
          onResult={(r) => setResult("radar", r)}
        />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>短期凭证交换（可选）</Text>
        <GlassCard themeMode={mode} testID="provider-token-exchange-byok-note" style={styles.banner}>
          <Text style={[styles.bannerText, { color: theme.textSecondary }]}>
            个人 BYOK 模式不需要 Token BFF；直连 LLM/语音 Key 即可。下列配置仅在企业或托管部署时使用。
          </Text>
        </GlassCard>
        <ProviderConnectionRow
          title="短期凭证交换"
          subtitle="个人模式可跳过 · 仅 HTTPS"
          result={results.tokenExchange ?? null}
          themeMode={mode}
          testID="provider-row-token-exchange"
        />
        <TextInput
          testID="provider-token-exchange-url"
          value={settings.tokenExchange.baseUrl}
          onChangeText={(baseUrl) =>
            setSettings((s) => ({
              ...s,
              tokenExchange: { ...s.tokenExchange, baseUrl },
            }))
          }
          onBlur={() => {
            const url = settings.tokenExchange.baseUrl.trim();
            if (url) {
              const v = validateProviderHttpsUrl(url);
              if (!v.ok) {
                setResult("tokenExchange", {
                  status: "error",
                  code: v.code ?? "TokenExchangeError",
                  hint: v.hint,
                });
                return;
              }
            }
            persistSettings(settings, "tokenExchange.baseUrl");
          }}
          placeholder="https://your-bff.example/token"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        />
        <TestConnectionButton
          testID="test-connection-token-exchange"
          themeMode={mode}
          onTest={async () =>
            testTokenExchangeConnection({
              ...settings.tokenExchange,
              baseUrl: mergedTokenUrl,
            })
          }
          onResult={(r) => setResult("tokenExchange", r)}
        />

        <Text style={[styles.sectionTitle, { color: theme.text }]}>行动执行</Text>
        <ProviderConnectionRow
          title="行动执行服务"
          subtitle="仅配置与测试连接（默认关闭）"
          result={results.executionApi ?? null}
          themeMode={mode}
          testID="provider-row-execution-api"
        />
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: theme.text }]}>启用行动执行服务</Text>
          <Switch
            testID="provider-execution-api-enabled"
            value={settings.executionApi.enabled}
            onValueChange={(enabled) => {
              const next = {
                ...settings,
                executionApi: { ...settings.executionApi, enabled },
              };
              persistSettings(next, "executionApi.enabled");
            }}
          />
        </View>
        <TextInput
          testID="provider-execution-api-url"
          value={settings.executionApi.baseUrl}
          onChangeText={(baseUrl) =>
            setSettings((s) => ({
              ...s,
              executionApi: { ...s.executionApi, baseUrl },
            }))
          }
          onBlur={() => persistSettings(settings, "executionApi.baseUrl")}
          placeholder="https://你的执行服务.example"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        />
        <TestConnectionButton
          testID="test-connection-execution-api"
          themeMode={mode}
          onTest={async () => testExecutionApiConnection(settings.executionApi)}
          onResult={(r) => setResult("executionApi", r)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: safeArea.screenTopChrome,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  banner: {
    marginBottom: spacing.md,
  },
  bannerText: {
    ...typography.caption,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 15,
    fontWeight: "600",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    minHeight: 44,
  },
  keyLabel: {
    ...typography.caption,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  saveKey: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    minHeight: 44,
    marginBottom: spacing.xs,
  },
  switchLabel: {
    ...typography.body,
  },
});
