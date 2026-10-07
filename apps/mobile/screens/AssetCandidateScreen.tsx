import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatCandidateTypeLabel } from "@my-brain/core";

import { BackButton } from "../navigation/BackButton";
import { PageHeader } from "../components/ui/PageHeader";
import { PrimaryPill } from "../components/ui/PrimaryPill";
import { useConversationSession } from "../hooks/useConversationSession";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { useProvisionalStore } from "../stores/provisionalStore";
import { useTheme } from "../theme/ThemeProvider";
import { brainTheme, safeArea, spacing } from "../theme/tokens";

interface Props {
  candidateId: string;
  testID?: string;
  onClose?: () => void;
}

export function AssetCandidateScreen({
  candidateId,
  testID = "screen-asset-candidate",
  onClose,
}: Props) {
  const candidates = useProvisionalStore((s) => s.candidates);
  const reject = useProvisionalStore((s) => s.reject);
  const closeAssetCandidate = useMobileAppStore((s) => s.closeAssetCandidate);
  const graphNodeCount = useMobileAppStore((s) => s.graph.countVisibleNodes());
  const confirmProvisional = useProvisionalStore((s) => s.confirm);
  const syncGraphView = useMobileAppStore((s) => s.syncGraphView);
  const setLastIngestSummary = useMobileAppStore((s) => s.setLastIngestSummary);
  const { focusProvisional } = useConversationSession();
  const { mode: themeMode, colors } = useTheme();
  const theme = brainTheme[themeMode];

  const candidate = useMemo(
    () => candidates.find((item) => item.id === candidateId) ?? null,
    [candidateId, candidates],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: safeArea.screenTopChrome,
        },
        scroll: { flex: 1 },
        scrollContent: {
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.lg,
          gap: spacing.sm,
        },
        card: {
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        mutedCard: {
          backgroundColor: colors.surfaceMuted,
        },
        warningCard: {
          backgroundColor: "#FF8A7A16",
        },
        accentLabel: {
          color: colors.accent,
          fontSize: 12,
          fontWeight: "600",
          marginBottom: 4,
        },
        hero: {
          color: colors.text,
          fontSize: 24,
          fontWeight: "600",
          marginBottom: 8,
        },
        caption: {
          color: theme.textSecondary,
          fontSize: 13,
          lineHeight: 18,
          marginTop: 4,
        },
        footer: {
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
          gap: spacing.sm,
        },
        actions: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: spacing.xs,
        },
        graphGuard: {
          color: theme.textSecondary,
          fontSize: 12,
          textAlign: "center",
        },
      }),
    [colors, theme],
  );

  if (!candidate || candidate.status === "confirmed" || candidate.status === "rejected") {
    return (
      <View style={styles.root} testID={testID}>
        <PageHeader
          variant="contract"
          title="变成长期资产？"
          subtitle="候选已处理或不存在。"
          leftSlot={
            <BackButton
              onPress={() => {
                closeAssetCandidate();
                onClose?.();
              }}
              testID="asset-candidate-back"
            />
          }
          testID="asset-candidate-header"
        />
      </View>
    );
  }

  const assetTypeLabel = formatCandidateTypeLabel(candidate);

  const handleClose = () => {
    closeAssetCandidate();
    onClose?.();
  };

  const handleConfirm = () => {
    focusProvisional(candidate.id);
    const result = confirmProvisional(candidate.id);
    if (result) {
      setLastIngestSummary(result.autoCurateSummary);
      syncGraphView();
    }
    handleClose();
  };

  const handleReject = () => {
    reject(candidate.id);
    handleClose();
  };

  return (
    <View style={styles.root} testID={testID}>
      <PageHeader
        variant="contract"
        title="变成长期资产？"
        subtitle="用户确认前，只是候选，不写永久图谱。"
        leftSlot={<BackButton onPress={handleClose} testID="asset-candidate-back" />}
        testID="asset-candidate-header"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        testID="asset-candidate-scroll"
      >
        <View style={styles.card}>
          <Text style={styles.accentLabel} testID="asset-candidate-type-label">
            {assetTypeLabel}
          </Text>
          <Text style={styles.hero}>{candidate.summary}</Text>
          <Text style={styles.caption}>
            来自刚才聊天：确认前不会写入永久星图。
          </Text>
        </View>
        <View style={[styles.card, styles.mutedCard]}>
          <Text style={styles.accentLabel}>候选状态</Text>
          <Text style={styles.caption} testID="asset-candidate-permanent-guard">
            当前是候选（{candidate.status}），不是永久资产。
          </Text>
          <Text style={styles.caption}>整理动作 · 入库后才执行</Text>
        </View>
        <View style={[styles.card, styles.warningCard]}>
          <Text style={styles.caption}>
            不会保存原始闲聊全文；只保存你确认的资产摘要。
          </Text>
          <Text style={styles.caption}>如果你点「不要」，候选会消失。</Text>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.actions}>
          <PrimaryPill
            label="入库"
            onPress={handleConfirm}
            testID="asset-candidate-confirm"
          />
          <PrimaryPill label="不要" onPress={handleReject} testID="asset-candidate-reject" />
        </View>
        <Text style={styles.graphGuard} testID="asset-candidate-graph-count">
          永久星图节点：{graphNodeCount}（确认入库后 +1）
        </Text>
      </View>
    </View>
  );
}
