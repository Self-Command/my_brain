import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DegradedModeBanner } from "../components/DegradedModeBanner";
import { CaptureInboxList } from "../components/CaptureInboxList";
import {
  buildCaptureInboxSections,
  captureInboxVisualFixturePendingCount,
  proposalFromCandidate,
  seedCaptureInboxVisualFixtureCandidates,
  type CaptureInboxRowViewModel,
} from "../components/captureInboxModel";
import { QuickCaptureFab } from "../components/QuickCaptureFab";
import { ContextDecisionBar } from "../components/ui/ContextDecisionBar";
import { PageHeader } from "../components/ui/PageHeader";
import { useContextCandidate } from "../hooks/useContextCandidate";
import { useConversationSession } from "../hooks/useConversationSession";
import { BackButton } from "../navigation/BackButton";
import { useNavigation } from "../navigation/NavigationContext";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { useProvisionalStore } from "../stores/provisionalStore";
import { useTheme } from "../theme/ThemeProvider";
import { safeArea, spacing, typography, type IntentKey } from "../theme/tokens";
import { isVisualFixtureRoute } from "../visual-fixtures/captureSession";

export function CaptureInboxScreen() {
  const inboxVisualCapture = isVisualFixtureRoute("CaptureInboxScreen");
  const { goBack } = useNavigation();
  const { mode: themeMode, colors } = useTheme();
  const candidates = useProvisionalStore((s) => s.candidates);
  const rejectProvisional = useProvisionalStore((s) => s.reject);
  const degraded = useMobileAppStore((s) => s.degraded);
  const setPendingIngestProposal = useMobileAppStore((s) => s.setPendingIngestProposal);
  const pendingIngestProposal = useMobileAppStore((s) => s.pendingIngestProposal);
  const { focusProvisional, confirmPendingIngest, dispatchIntent } = useConversationSession();
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetRow, setSheetRow] = useState<CaptureInboxRowViewModel | null>(null);

  const pendingCount = useMemo(
    () =>
      candidates.filter(
        (c) => c.status === "pending" || c.status === "explaining",
      ).length,
    [candidates],
  );
  useLayoutEffect(() => {
    if (!inboxVisualCapture) {
      return;
    }
    useProvisionalStore.setState({
      candidates: seedCaptureInboxVisualFixtureCandidates(),
      lastExplanation: null,
      lastSsrfHint: null,
    });
    const degraded = useMobileAppStore.getState().degraded;
    useMobileAppStore.setState({
      degraded: { ...degraded, active: [] },
    });
  }, [inboxVisualCapture]);

  const sections = useMemo(() => buildCaptureInboxSections(candidates), [candidates]);

  const displayPendingCount = useMemo(() => {
    if (!inboxVisualCapture) {
      return pendingCount;
    }
    return captureInboxVisualFixturePendingCount(candidates);
  }, [candidates, inboxVisualCapture, pendingCount]);

  const selectedRow = useMemo(() => {
    for (const section of sections) {
      const row = section.rows.find((r) => r.id === selectedRowId);
      if (row) {
        return row;
      }
    }
    return null;
  }, [sections, selectedRowId]);

  const proposeIngestForRow = useCallback(
    (row: CaptureInboxRowViewModel) => {
      setSelectedRowId(row.id);
      focusProvisional(row.id);
      setPendingIngestProposal(proposalFromCandidate(row.candidate));
      setSheetRow(row);
      setSheetOpen(true);
    },
    [focusProvisional, setPendingIngestProposal],
  );

  const contextCandidate = useContextCandidate({
    labelVariant: "inbox",
    selectedProvisionalId: selectedRowId,
    onProposeIngest: () => {
      if (selectedRow) {
        proposeIngestForRow(selectedRow);
      }
    },
    onClearSelection: () => setSelectedRowId(null),
  });

  const handleProposeIngest = useCallback(
    (proposal: Parameters<typeof setPendingIngestProposal>[0], candidateId: string) => {
      const row = sections.flatMap((s) => s.rows).find((r) => r.id === candidateId);
      if (row) {
        proposeIngestForRow(row);
      } else {
        focusProvisional(candidateId);
        setPendingIngestProposal(proposal);
        setSheetOpen(true);
      }
    },
    [focusProvisional, proposeIngestForRow, sections, setPendingIngestProposal],
  );

  const handleKeepPending = useCallback((_candidateId: string) => {
    // Keep provisional_pending — no graph write.
  }, []);

  const handleDiscard = useCallback(
    (candidateId: string) => {
      rejectProvisional(candidateId);
      if (selectedRowId === candidateId) {
        setSelectedRowId(null);
        setSheetOpen(false);
        setSheetRow(null);
      }
    },
    [rejectProvisional, selectedRowId],
  );

  const contextActions = useMemo(() => {
    if (!contextCandidate) {
      return [];
    }
    return [
      {
        key: "ingest" as IntentKey,
        onPress: () => {
          contextCandidate.onIngest();
          setSheetOpen(true);
        },
      },
      {
        key: "skip" as IntentKey,
        onPress: contextCandidate.onSkip,
      },
      {
        key: "detail" as IntentKey,
        onPress: () => {
          if (selectedRow) {
            setSheetRow(selectedRow);
            setSheetOpen(true);
          }
          contextCandidate.onDetail();
        },
      },
    ];
  }, [contextCandidate, selectedRow]);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background },
        inboxVisualCapture ? styles.rootFixture : null,
      ]}
      testID="capture-inbox-screen"
    >
      {inboxVisualCapture ? (
        <View style={styles.fixtureHeader} testID="capture-inbox-header">
          <Text
            style={[styles.fixtureTitle, { color: colors.text }]}
            testID="capture-inbox-header-title"
            accessibilityRole="header"
          >
            待点亮星尘
          </Text>
          <Text
            style={[styles.fixtureSubtitle, { color: colors.textSecondary }]}
            testID="capture-inbox-header-subtitle"
          >
            候选先在这里，确认前不会进入永久星图。
          </Text>
        </View>
      ) : (
        <PageHeader
          title="待点亮星尘"
          subtitle="候选先在这里，确认前不会进入永久星图。"
          themeMode={themeMode}
          leftSlot={<BackButton onPress={goBack} />}
          testID="capture-inbox-header"
        />
      )}

      {!inboxVisualCapture ? (
        <DegradedModeBanner codes={degraded.active} testID="capture-inbox-degraded-banner" />
      ) : null}

      {!inboxVisualCapture && pendingCount > 0 ? (
        <Text
          style={[styles.count, { color: colors.primary }]}
          testID="capture-inbox-queue-count"
        >
          {pendingCount} 条待确认
        </Text>
      ) : null}

      <CaptureInboxList
        sections={sections}
        pendingCount={displayPendingCount}
        themeMode={themeMode}
        onProposeIngest={handleProposeIngest}
        onKeepPending={handleKeepPending}
        onDiscard={handleDiscard}
        onOpenDecisionSheet={(row) => {
          setSelectedRowId(row.id);
          focusProvisional(row.id);
          setSheetRow(row);
          setSheetOpen(true);
        }}
        sheetRow={sheetRow}
        sheetVisible={sheetOpen}
        onSheetDismiss={() => {
          setSheetOpen(false);
          if (!pendingIngestProposal) {
            setSheetRow(null);
          }
        }}
        onSheetIngest={() => {
          confirmPendingIngest();
          setSheetOpen(false);
          setSheetRow(null);
          setSelectedRowId(null);
        }}
        onSheetSkip={() => {
          if (sheetRow) {
            handleKeepPending(sheetRow.id);
          }
          setSheetOpen(false);
          setPendingIngestProposal(null);
        }}
        onSheetDetail={() => {
          dispatchIntent("explain_more");
        }}
      />

      {!inboxVisualCapture && contextCandidate ? (
        <ContextDecisionBar
          actions={contextActions}
          labelVariant="inbox"
          themeMode={themeMode}
        />
      ) : null}

      <QuickCaptureFab
        testID="capture-inbox-quick-capture-fab"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: safeArea.screenTopChrome,
  },
  rootFixture: {
    paddingTop: 0,
  },
  fixtureHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: 52,
    paddingBottom: 4,
  },
  fixtureTitle: {
    ...typography.title,
    fontSize: 24,
    lineHeight: 30,
    textAlign: "left",
  },
  fixtureSubtitle: {
    ...typography.caption,
    marginTop: spacing.xs,
    textAlign: "left",
  },
  count: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});
