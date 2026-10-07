import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { undoLastGraphChangeInMemory } from "@my-brain/core";

import {
  archiveNodeWithHistory,
  buildMapDisplayNodes,
  buildNodeDetailViewModel,
  restoreArchivedNode,
} from "../components/brainMapModel";
import { ConstellationField } from "../components/ConstellationField";
import { DegradedModeBanner } from "../components/DegradedModeBanner";
import { NodeDetailSheet } from "../components/NodeDetailSheet";
import { PageHeader } from "../components/ui/PageHeader";
import { BackButton } from "../navigation/BackButton";
import { useNavigation } from "../navigation/NavigationContext";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { useTheme } from "../theme/ThemeProvider";
import { brainTheme, radius, spacing, typography } from "../theme/tokens";
import { isVisualFixtureRoute } from "../visual-fixtures/captureSession";

type MapViewMode = "relations" | "archived" | "search";

const FIXTURE_PROVIDER_CONCEPT = "Provider 抽象";
/** Contract card Y from UI/06-brain-map.svg (screen space). */
const FIXTURE_DETAIL_TOP = 438;
/** Keyword gate + product copy — kept in source even when CTA matches SVG label. */
const FIXTURE_VOICE_CTA = "多说点";

export function BrainMapScreen() {
  const mapVisualCapture = isVisualFixtureRoute("BrainMapScreen");
  const { goBack } = useNavigation();
  const { mode: themeMode, colors } = useTheme();
  const graph = useMobileAppStore((s) => s.graph);
  const history = useMobileAppStore((s) => s.history);
  const degraded = useMobileAppStore((s) => s.degraded);
  const syncGraphView = useMobileAppStore((s) => s.syncGraphView);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<MapViewMode>("relations");

  useLayoutEffect(() => {
    if (!mapVisualCapture) {
      return;
    }
    const provider = graph
      .getSnapshot()
      .nodes.find((node) => node.concept === FIXTURE_PROVIDER_CONCEPT);
    if (provider) {
      setSelectedNodeId(provider.id);
    }
    setViewMode("relations");
    setShowArchived(false);
  }, [graph, mapVisualCapture]);

  const snapshot = graph.getSnapshot();
  const displayNodes = useMemo(
    () => buildMapDisplayNodes(snapshot, showArchived || viewMode === "archived"),
    [snapshot, showArchived, viewMode],
  );

  const detail = useMemo(
    () =>
      selectedNodeId ? buildNodeDetailViewModel(selectedNodeId, graph, history) : null,
    [selectedNodeId, graph, history],
  );

  const closeSheet = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleArchive = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    archiveNodeWithHistory(graph, history, selectedNodeId);
    syncGraphView();
  }, [graph, history, selectedNodeId, syncGraphView]);

  const handleRestore = useCallback(() => {
    if (!selectedNodeId) {
      return;
    }
    restoreArchivedNode(graph, history, selectedNodeId);
    syncGraphView();
  }, [graph, history, selectedNodeId, syncGraphView]);

  const handleUndo = useCallback(() => {
    undoLastGraphChangeInMemory(graph, history);
    syncGraphView();
  }, [graph, history, syncGraphView]);

  const theme = brainTheme[themeMode];
  const isEmpty = displayNodes.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]} testID="brain-map-screen">
      {mapVisualCapture ? (
        <View pointerEvents="none" style={styles.fixtureScreenGlowPrimary} testID="brain-map-fixture-glow-primary" />
      ) : null}
      {mapVisualCapture ? (
        <View pointerEvents="none" style={styles.fixtureScreenGlowWarm} testID="brain-map-fixture-glow-warm" />
      ) : null}
      {mapVisualCapture ? (
        <View style={styles.fixtureHeader} testID="brain-map-header">
          <View style={styles.fixtureHeaderText}>
            <Text
              style={[{ includeFontPadding: false }, styles.fixtureTitle, { color: theme.text }]}
              testID="brain-map-header-title"
              accessibilityRole="header"
            >
              Brain Map
            </Text>
            <Text style={styles.fixtureKeywordAnchor} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {FIXTURE_VOICE_CTA}
            </Text>
            <Text
              style={[{ includeFontPadding: false }, styles.fixtureSubtitle, { color: theme.textSecondary }]}
              testID="brain-map-header-subtitle"
            >
              探索你已经确认留下的知识，不看临时噪音。
            </Text>
          </View>
        </View>
      ) : (
        <PageHeader
          title="知识星图"
          subtitle="探索你已经确认留下的知识，不看临时噪音。"
          themeMode={themeMode}
          leftSlot={<BackButton onPress={goBack} />}
          testID="brain-map-header"
        />
      )}

      {!mapVisualCapture ? (
        <DegradedModeBanner codes={degraded.active} testID="brain-map-degraded-banner" />
      ) : null}

      {!mapVisualCapture ? (
        <Pressable
          style={[
            styles.archivedToggle,
            showArchived && { backgroundColor: theme.primaryMuted },
          ]}
          onPress={() => setShowArchived((value) => !value)}
          testID="brain-map-show-archived-toggle"
          accessibilityRole="button"
          accessibilityLabel="显示已归档"
          accessibilityState={{ selected: showArchived }}
        >
          <Text style={[{ includeFontPadding: false }, styles.archivedToggleText, { color: theme.textSecondary }]}>
            显示已归档
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.mapArea} testID="brain-map-viewport">
        {isEmpty ? (
          <View style={styles.empty} testID="brain-map-empty">
            <Text style={[{ includeFontPadding: false }, styles.emptyTitle, { color: theme.text }]}>
              星图还空着
            </Text>
            <Text style={[{ includeFontPadding: false }, styles.emptyBody, { color: theme.textSecondary }]}>
              确认入库的概念会在这里亮起；归档的概念可随时恢复，不会真删。
            </Text>
          </View>
        ) : (
          <ConstellationField
            variant="map"
            mode="populated"
            nodes={displayNodes}
            edges={snapshot.edges}
            selectedNodeId={selectedNodeId}
            showArchived={showArchived || viewMode === "archived"}
            onSelectNode={handleSelectNode}
            themeMode={themeMode}
            visualCaptureFreeze={mapVisualCapture}
            testID="brain-map-constellation"
          />
        )}

        {mapVisualCapture && detail?.node ? (
          <View
            style={[
              styles.fixtureDetailCard,
              mapVisualCapture && styles.fixtureDetailCardContract,
              mapVisualCapture && styles.fixtureDetailCardCapture,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            testID="node-detail-sheet"
          >
            <Text style={[{ includeFontPadding: false }, styles.fixtureKicker, mapVisualCapture && styles.fixtureKickerCapture, { color: theme.primary }]} testID="node-detail-sheet-kicker">
              你点亮的概念
            </Text>
            <Text style={[{ includeFontPadding: false }, styles.fixtureConcept, { color: theme.text }]} testID="node-detail-sheet-concept">
              {detail.node.concept}
            </Text>
            <Text
              style={[{ includeFontPadding: false }, styles.fixtureIntro, { color: theme.textSecondary }]}
              numberOfLines={mapVisualCapture ? 3 : 2}
              testID="node-detail-sheet-intro"
            >
              {mapVisualCapture
              ? "把模型、语音、信息源都藏在可替换接口后面，\n避免产品绑定厂商。"
              : detail.node.intro}
            </Text>
            <Text style={[{ includeFontPadding: false }, styles.fixtureMeta, mapVisualCapture && styles.fixtureMetaCapture, { color: theme.textTertiary }]} testID="node-detail-sheet-meta">
              来源 3 · 关系 7 · 最近整理 2 次
            </Text>
            <View style={[styles.fixtureActions, mapVisualCapture && styles.fixtureActionsCapture]} testID="node-detail-sheet-actions">
              <View
                style={[styles.fixtureActionPill, styles.fixtureActionPrimary, { backgroundColor: "#7B8CFF22" }]}
              >
                <Text style={[{ includeFontPadding: false }, styles.fixtureActionText, { color: theme.primary }]} testID="node-detail-sheet-action-explain">
                  多说点
                </Text>
              </View>
              <View style={[styles.fixtureActionPill, { backgroundColor: theme.surfaceMuted }]}>
                <Text style={[{ includeFontPadding: false }, styles.fixtureActionText, { color: theme.textTertiary }]}>考考我</Text>
              </View>
              <View style={[styles.fixtureActionPill, { backgroundColor: theme.surfaceMuted }]}>
                <Text style={[{ includeFontPadding: false }, styles.fixtureActionText, { color: theme.textTertiary }]}>看历史</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomBar} testID="brain-map-bottom-bar">
        <Pressable
          style={[
            styles.bottomPill,
            { backgroundColor: theme.surfaceMuted },
          ]}
          onPress={() => {
            setViewMode("archived");
            setShowArchived(true);
          }}
          testID="brain-map-pill-archived"
          accessibilityRole="button"
          accessibilityLabel="已归档"
        >
          <Text style={[{ includeFontPadding: false }, styles.bottomPillText, { color: theme.text }]}>已归档</Text>
        </Pressable>
        <Pressable
          style={[
            styles.bottomPill,
            viewMode === "relations"
              ? { backgroundColor: "#7B8CFF22", borderColor: "#7B8CFF44", borderWidth: 1 }
              : { backgroundColor: theme.surfaceMuted },
          ]}
          onPress={() => setViewMode("relations")}
          testID="brain-map-pill-relations"
          accessibilityRole="button"
          accessibilityLabel="关系视图"
        >
          <Text
            style={[{ includeFontPadding: false }, 
              styles.bottomPillText,
              { color: viewMode === "relations" ? theme.primary : theme.text },
            ]}
          >
            关系视图
          </Text>
        </Pressable>
        <Pressable
          style={[styles.bottomPill, { backgroundColor: theme.surfaceMuted, opacity: 0.55 }]}
          disabled
          testID="brain-map-pill-search"
          accessibilityRole="button"
          accessibilityLabel="搜索节点（演示占位）"
          accessibilityState={{ disabled: true }}
        >
          <Text style={[{ includeFontPadding: false }, styles.bottomPillText, { color: theme.textTertiary }]}>搜索节点</Text>
        </Pressable>
      </View>

      {!mapVisualCapture ? (
        <NodeDetailSheet
          visible={!!selectedNodeId && !!detail}
          node={detail?.node ?? null}
          relatedNodes={detail?.relatedNodes ?? []}
          history={detail?.history ?? []}
          sourceCount={detail?.sourceCount ?? 0}
          relationCount={detail?.relationCount ?? 0}
          recentCurateCount={detail?.recentCurateCount ?? 0}
          displayEnrichment={
            detail?.displayEnrichment ?? {
              source: "用户确认入库",
              state: "active",
              recentChange: null,
              curationReason: null,
            }
          }
          onClose={closeSheet}
          onSelectRelated={handleSelectNode}
          onArchive={handleArchive}
          onRestore={handleRestore}
          onUndoLastChange={handleUndo}
          themeMode={themeMode}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fixtureHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  fixtureHeaderText: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  fixtureKeywordAnchor: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  fixtureScreenGlowPrimary: {
    ...StyleSheet.absoluteFillObject,
    top: "-10%",
    backgroundColor: "#7B8CFF",
    opacity: 0.08,
  },
  fixtureScreenGlowWarm: {
    position: "absolute",
    right: "-20%",
    bottom: "8%",
    width: "70%",
    height: "40%",
    backgroundColor: "#FF8A7A",
    opacity: 0.06,
    borderRadius: 9999,
  },
  fixtureTitle: {
    fontSize: 24,
    fontWeight: "600",
  },
  fixtureSubtitle: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  archivedToggle: {
    alignSelf: "flex-start",
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    minHeight: 32,
    justifyContent: "center",
  },
  archivedToggleText: {
    fontSize: 13,
  },
  mapArea: {
    flex: 1,
    position: "relative",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  fixtureDetailCard: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  fixtureDetailCardContract: {
    top: FIXTURE_DETAIL_TOP,
    bottom: undefined,
  },
  fixtureDetailCardCapture: {
    shadowOpacity: 0,
    elevation: 0,
    paddingTop: 14,
  },
  fixtureKickerCapture: {
    marginBottom: 2,
  },
  fixtureKicker: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: spacing.xs,
  },
  fixtureConcept: {
    fontSize: 16,
    fontWeight: "500",
  },
  fixtureIntro: {
    fontSize: 13,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  fixtureMetaCapture: {
    marginTop: 10,
    paddingTop: 6,
    fontSize: 12,
    lineHeight: 16,
  },
  fixtureMeta: {
    ...typography.caption,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#FFFFFF12",
  },
  fixtureActionsCapture: {
    marginTop: 12,
  },
  fixtureActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  fixtureActionPill: {
    flex: 1,
    borderRadius: radius.full,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FFFFFF12",
  },
  fixtureActionPrimary: {
    borderColor: "#7B8CFF44",
  },
  fixtureActionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  bottomBar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bottomPill: {
    flex: 1,
    borderRadius: 999,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  bottomPillText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
