import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { buildLivingHomeEntry } from "@my-brain/core";

import { ConstellationField } from "../components/ConstellationField";
import {
  CONTEXT_SHEET_BACKDROP_EDGES,
  CONTEXT_SHEET_BACKDROP_NODES,
} from "../components/brainMapModel";
import { ContextDecisionSheet } from "../components/ContextDecisionSheet";
import { ColdStartDialogue } from "./ColdStartDialogue";
import { CompanionChatScreen } from "./CompanionChatScreen";
import { AssetCandidateScreen } from "./AssetCandidateScreen";
import { DegradedModeBanner } from "../components/DegradedModeBanner";
import { HomeLightEntries } from "../components/HomeLightEntries";
import { LivingHomeDailyEntry } from "../components/LivingHomeDailyEntry";
import { ProvisionalQueueSheet } from "../components/ProvisionalQueueSheet";
import { QuickCaptureFab } from "../components/QuickCaptureFab";
import { TodayFocusCard } from "../components/TodayFocusCard";
import { PrimaryPill } from "../components/ui/PrimaryPill";
import { ContextDecisionBar } from "../components/ui/ContextDecisionBar";
import { VoiceOrb } from "../components/ui/VoiceOrb";
import { useLivingBrainVoiceOrb } from "../voice/useLivingBrainVoiceOrb";
import { useContextCandidate } from "../hooks/useContextCandidate";
import { useConversationSession } from "../hooks/useConversationSession";
import { Routes } from "../navigation/routes";
import { useNavigation } from "../navigation/NavigationContext";
import { setDiagnosticRoute } from "../diagnostics/crashRouteContext";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { useProvisionalStore } from "../stores/provisionalStore";
import { useTheme } from "../theme/ThemeProvider";
import { brainTheme, copy, safeArea, type IntentKey } from "../theme/tokens";
import { isVisualFixtureRoute } from "../visual-fixtures/captureSession";

function mapIntentKey(key: IntentKey): "ingest" | "skip" | "explain_more" {
  if (key === "detail") {
    return "explain_more";
  }
  return key;
}

export function LivingBrainHome() {
  const homeVisualCapture = isVisualFixtureRoute("LivingBrainHome");
  const contextBackdropCapture = isVisualFixtureRoute("ContextDecisionSheet");
  const fixtureCapture = homeVisualCapture || contextBackdropCapture;
  const phase = useMobileAppStore((s) => s.phase);
  const coldStartComplete = useMobileAppStore((s) => s.coldStartComplete);
  const userProfile = useMobileAppStore((s) => s.userProfile);
  const startColdStart = useMobileAppStore((s) => s.startColdStart);
  const signals = useMobileAppStore((s) => s.signals);
  const visibleNodes = useMobileAppStore((s) => s.visibleNodes);
  const storageReady = useMobileAppStore((s) => s.storageReady);
  const degraded = useMobileAppStore((s) => s.degraded);
  const providerVoiceLive = useMobileAppStore((s) => s.providerVoiceLive);
  const openSettings = useMobileAppStore((s) => s.openSettings);
  const pendingIngestProposal = useMobileAppStore((s) => s.pendingIngestProposal);
  const setPendingIngestProposal = useMobileAppStore((s) => s.setPendingIngestProposal);
  const queueSheetOpen = useMobileAppStore((s) => s.queueSheetOpen);
  const setQueueSheetOpen = useMobileAppStore((s) => s.setQueueSheetOpen);
  const companionChatOpen = useMobileAppStore((s) => s.companionChatOpen);
  const openCompanionChat = useMobileAppStore((s) => s.openCompanionChat);
  const assetCandidateTargetId = useMobileAppStore((s) => s.assetCandidateTargetId);
  const pendingCount = useProvisionalStore((s) => s.listPending().length);
  const { conversation, dispatchIntent, dispatchVoiceIntent, focusSignal, confirmPendingIngest } =
    useConversationSession();
  const { navigate } = useNavigation();
  const { mode: themeMode, colors: themeColors } = useTheme();
  const theme = brainTheme[themeMode];
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: themeColors.background,
          paddingTop: fixtureCapture ? 0 : safeArea.screenTopChrome,
        },
        header: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          paddingHorizontal: 16,
          marginBottom: 4,
        },
        headerText: {
          flex: 1,
          paddingRight: 8,
        },
        brand: {
          color: themeColors.text,
          fontSize: 20,
          fontWeight: "600",
        },
        subtitle: {
          color: theme.textSecondary,
          fontSize: 13,
          lineHeight: 18,
          marginTop: 4,
        },
        menu: {
          color: theme.textSecondary,
          fontSize: 22,
          padding: 8,
        },
        emptyShell: {
          flex: 1,
        },
        adaptiveShell: {
          flex: 1,
        },
        scroll: {
          flex: 1,
        },
        adaptiveScroll: {
          flex: 1,
        },
        pendingBanner: {
          marginHorizontal: 16,
          marginBottom: 8,
          backgroundColor: themeColors.surface,
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
        },
        pendingBannerText: {
          color: themeColors.primary,
          fontSize: 14,
          fontWeight: "600",
        },
        invite: {
          paddingHorizontal: 24,
          paddingTop: 8,
          alignItems: "center",
          gap: 10,
        },
        hero: {
          color: themeColors.text,
          fontSize: 22,
          fontWeight: "600",
          marginBottom: 2,
        },
        bodyLine: {
          color: theme.textSecondary,
          fontSize: 15,
          textAlign: "center",
          lineHeight: 22,
        },
        secondaryCta: {
          width: "100%",
          maxWidth: 320,
          marginTop: 4,
          paddingVertical: 14,
          paddingHorizontal: 24,
          borderRadius: 999,
          backgroundColor: themeColors.surface,
          borderWidth: 1,
          borderColor: theme.border,
          alignItems: "center",
        },
        secondaryCtaText: {
          color: theme.textSecondary,
          fontSize: 16,
          fontWeight: "500",
        },
        voiceHint: {
          color: theme.textSecondary,
          fontSize: 13,
          marginTop: 4,
          marginBottom: 8,
        },
        orbDock: {
          alignItems: "center",
          paddingBottom: 32,
          marginTop: "auto",
        },
        orbDockAdaptive: {
          alignItems: "center",
          paddingBottom: 96,
          marginTop: "auto",
        },
        storageHint: {
          color: theme.textSecondary,
          fontSize: 13,
          lineHeight: 18,
          marginHorizontal: 16,
          marginBottom: 8,
          textAlign: "center",
        },
        contextBackdropGlowPrimary: {
          ...StyleSheet.absoluteFillObject,
          top: "-10%",
          backgroundColor: theme.primary,
          opacity: 0.08,
        },
        contextBackdropGlowWarm: {
          position: "absolute",
          right: "-20%",
          bottom: "8%",
          width: "70%",
          height: "40%",
          backgroundColor: theme.accent,
          opacity: 0.06,
          borderRadius: 9999,
        },
        companionChatEntry: {
          marginHorizontal: 16,
          marginTop: 8,
          marginBottom: 8,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderRadius: 12,
          backgroundColor: themeColors.surface,
          borderWidth: 1,
          borderColor: theme.border,
        },
        companionChatEntryTitle: {
          color: themeColors.text,
          fontSize: 16,
          fontWeight: "600",
        },
        companionChatEntrySubtitle: {
          color: theme.textSecondary,
          fontSize: 13,
          marginTop: 4,
        },
        companionChatOverlay: {
          ...StyleSheet.absoluteFillObject,
          zIndex: 20,
          backgroundColor: themeColors.background,
        },
      }),
    [theme, themeColors, fixtureCapture],
  );
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isAdaptiveLive = coldStartComplete && phase === "adaptive_live";
  const isEmptyInvite = !coldStartComplete && visibleNodes.length === 0;
  const showEmptyShell = isEmptyInvite && !isAdaptiveLive;
  const showStorageNotReadyHint = !storageReady && phase !== "launch";

  const livingHomeEntry = useMemo(() => {
    if (!isAdaptiveLive || !userProfile) {
      return null;
    }
    return buildLivingHomeEntry(userProfile, signals, degraded);
  }, [degraded, isAdaptiveLive, signals, userProfile]);

  const proposeSignalIngest = useCallback(() => {
    focusSignal(0);
    const sig = signals[0];
    if (!sig) {
      return;
    }
    const title = sig.evidenceRefs[0] ?? "新概念";
    setPendingIngestProposal({
      id: `home-proposal-${title}`,
      concept: title.slice(0, 32),
      intro: `来自今日入口：${title}`,
      sourceLinks: sig.evidenceRefs,
      createdAt: new Date().toISOString(),
    });
    setSheetOpen(true);
  }, [focusSignal, setPendingIngestProposal, signals]);

  const contextCandidate = useContextCandidate({
    labelVariant: "default",
    selectedNodeId,
    onProposeIngest: proposeSignalIngest,
    onClearSelection: () => setSelectedNodeId(null),
  });
  const hasContextCandidate = contextCandidate !== null;

  const voiceDisconnected = degraded.active.includes("voice_disconnected");
  const voiceSessionEnabled =
    !voiceDisconnected && providerVoiceLive;
  const livingBrainVoice = useLivingBrainVoiceOrb({
    enabled: voiceSessionEnabled,
    dispatchIntent,
    dispatchVoiceIntent,
  });
  const voiceOrbState = voiceSessionEnabled
    ? livingBrainVoice.orbState
    : voiceDisconnected
      ? "degraded"
      : "idle";
  const onEmptyShellOrbPress = voiceDisconnected
    ? undefined
    : providerVoiceLive
      ? livingBrainVoice.onOrbPress
      : startColdStart;
  const emptyShellVoiceHint = voiceDisconnected
    ? "语音暂不可用，可以先用文字聊聊"
    : copy.home.voiceHint;

  useEffect(() => {
    setDiagnosticRoute("living-brain-home", "LivingBrainHome");
  }, [phase]);

  const onOpenSettings = () => {
    openSettings();
    navigate(Routes.Settings);
  };

  const onTodayFocusPress = () => {
    navigate(Routes.Today);
  };

  const contextActions = useMemo(
    () => {
      if (!contextCandidate) {
        return [];
      }
      if (contextCandidate.kind === "node") {
        return [
          {
            key: "ingest" as const,
            onPress: () => {
              navigate(Routes.BrainMap);
              setSelectedNodeId(null);
            },
          },
          {
            key: "skip" as const,
            onPress: () => {
              navigate(Routes.BrainMap);
              setSelectedNodeId(contextCandidate.nodeIds[0] ?? null);
            },
          },
          {
            key: "detail" as const,
            onPress: () => {
              dispatchIntent("explain_more");
            },
            variant: "primary" as const,
          },
        ];
      }
      return [
        {
          key: "ingest" as const,
          onPress: () => {
            contextCandidate.onIngest();
            setSheetOpen(true);
          },
        },
        {
          key: "skip" as const,
          onPress: contextCandidate.onSkip,
        },
        {
          key: "detail" as const,
          onPress: () => {
            dispatchIntent(mapIntentKey("detail"));
            setSheetOpen(true);
          },
          variant: "primary" as const,
        },
      ];
    },
    [contextCandidate, dispatchIntent, navigate],
  );

  const sheetVisible =
    sheetOpen &&
    pendingIngestProposal !== null &&
    contextCandidate?.kind !== "node";

  if (contextBackdropCapture) {
    const provider = CONTEXT_SHEET_BACKDROP_NODES.find((node) => node.concept === "Provider 抽象");

    return (
      <View style={{ flex: 1, backgroundColor: themeColors.background }} testID="living-brain-home">
        <View pointerEvents="none" style={styles.contextBackdropGlowPrimary} />
        <View pointerEvents="none" style={styles.contextBackdropGlowWarm} />
        <ConstellationField
          variant="map"
          mode="populated"
          nodes={CONTEXT_SHEET_BACKDROP_NODES}
          edges={CONTEXT_SHEET_BACKDROP_EDGES}
          selectedNodeId={provider?.id ?? null}
          visualCaptureFreeze
          themeMode={themeMode}
          testID="context-backdrop-constellation"
        />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="living-brain-home">
      {/* ... header unchanged ... */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.brand}>my_brain</Text>
          {showEmptyShell ? (
            <Text style={styles.subtitle} testID="home-empty-subtitle">
              {copy.home.emptySubtitle}
            </Text>
          ) : livingHomeEntry ? (
            <Text style={styles.subtitle} testID="home-daily-entry-headline">
              {livingHomeEntry.headline}
            </Text>
          ) : null}
        </View>
        {fixtureCapture ? null : (
        <Pressable
          onPress={onOpenSettings}
          testID="settings-entry"
          accessibilityRole="button"
          accessibilityLabel="信任与设置"
        >
          <Text style={styles.menu}>···</Text>
        </Pressable>
        )}
      </View>

      {!fixtureCapture ? <DegradedModeBanner codes={degraded.active} /> : null}

      {showStorageNotReadyHint ? (
        <Text style={styles.storageHint} testID="home-storage-not-ready">
          本地存储还在准备，星图与回顾会稍后从已保存数据加载。
        </Text>
      ) : null}

      {pendingCount > 0 && !queueSheetOpen && showEmptyShell ? (
        <Pressable
          style={styles.pendingBanner}
          onPress={() => setQueueSheetOpen(true)}
          testID="provisional-pending-banner"
        >
          <Text style={styles.pendingBannerText} testID="provisional-pending-count">
            {pendingCount} 条待点亮星尘 · 点击查看
          </Text>
        </Pressable>
      ) : null}

      {showEmptyShell ? (
        <View style={styles.emptyShell} testID="home-empty-shell">
          <ConstellationField
            mode="empty"
            themeMode={themeMode}
            visualCaptureFreeze={fixtureCapture}
          />
          {phase === "empty_invite" ? (
            <View style={styles.invite} testID="home-empty-invite">
              <Text style={styles.hero}>{copy.home.emptyTitle}</Text>
              <Text style={styles.bodyLine}>{copy.home.emptyBodyLine1}</Text>
              <Text style={styles.bodyLine}>{copy.home.emptyBodyLine2}</Text>
              <PrimaryPill
                label={copy.home.startChat}
                onPress={startColdStart}
                themeMode={themeMode}
                testID="start-cold-start"
              />
              <Pressable
                style={styles.secondaryCta}
                onPress={() => setQuickCaptureOpen(true)}
                testID="quick-capture-cta"
                accessibilityRole="button"
                accessibilityLabel={copy.home.quickCapture}
              >
                <Text style={styles.secondaryCtaText}>{copy.home.quickCapture}</Text>
              </Pressable>
              <Text style={styles.voiceHint} testID="voice-hint">
                {emptyShellVoiceHint}
              </Text>
            </View>
          ) : null}
          {phase === "cold_start" ? <ColdStartDialogue /> : null}
          <View style={styles.orbDock}>
            <VoiceOrb
              state={voiceOrbState}
              themeMode={themeMode}
              onPress={onEmptyShellOrbPress}
              testID="home-voice-orb"
              accessibilityLabel={
                voiceDisconnected
                  ? "语音不可用，可使用文字"
                  : providerVoiceLive
                    ? livingBrainVoice.accessibilityLabel
                    : "语音助手待命中"
              }
              errorHint={providerVoiceLive ? livingBrainVoice.lastError : undefined}
            />
          </View>
        </View>
      ) : isAdaptiveLive ? (
        <View style={styles.adaptiveShell} testID="home-adaptive-shell">
          <ConstellationField
            mode="populated"
            nodes={visibleNodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            themeMode={themeMode}
          />
          <ScrollView style={styles.adaptiveScroll} testID="home-adaptive-scroll">
            {livingHomeEntry ? (
              <LivingHomeDailyEntry entry={livingHomeEntry} themeMode={themeMode} />
            ) : null}
            <TodayFocusCard
              signal={signals[0]}
              profile={userProfile}
              themeMode={themeMode}
              onPress={onTodayFocusPress}
            />
            <HomeLightEntries
              pendingCount={pendingCount}
              themeMode={themeMode}
              onCapturePress={() => navigate(Routes.CaptureInbox)}
              onBrainMapPress={() => navigate(Routes.BrainMap)}
              onMemoryReviewPress={() => navigate(Routes.MemoryReview)}
            />
            <Pressable
              style={styles.companionChatEntry}
              onPress={openCompanionChat}
              testID="home-companion-chat-entry"
              accessibilityRole="button"
              accessibilityLabel="陪你聊会儿"
            >
              <Text style={styles.companionChatEntryTitle}>陪你聊会儿</Text>
              <Text style={styles.companionChatEntrySubtitle}>闲聊默认不入库</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.orbDockAdaptive}>
            <VoiceOrb
              state={voiceOrbState}
              themeMode={themeMode}
              testID="home-voice-orb"
              accessibilityLabel={livingBrainVoice.accessibilityLabel}
              errorHint={livingBrainVoice.lastError}
              onPress={livingBrainVoice.onOrbPress}
            />
          </View>
          {hasContextCandidate ? (
            <ContextDecisionBar
              actions={contextActions}
              labelVariant={contextCandidate?.labelVariant ?? "default"}
              themeMode={themeMode}
            />
          ) : null}
          <QuickCaptureFab />
        </View>
      ) : (
        <ScrollView style={styles.scroll}>
          {phase === "cold_start" ? <ColdStartDialogue /> : null}
        </ScrollView>
      )}

      {!isAdaptiveLive && phase !== "empty_invite" && phase !== "cold_start" ? (
        <QuickCaptureFab />
      ) : null}
      <QuickCaptureFab
        showFab={false}
        open={quickCaptureOpen}
        onOpenChange={setQuickCaptureOpen}
      />
      <ProvisionalQueueSheet />
      {companionChatOpen ? (
        <View style={styles.companionChatOverlay} testID="companion-chat-overlay">
          <CompanionChatScreen />
        </View>
      ) : null}
      {assetCandidateTargetId ? (
        <View style={styles.companionChatOverlay} testID="asset-candidate-overlay">
          <AssetCandidateScreen candidateId={assetCandidateTargetId} />
        </View>
      ) : null}
      {contextCandidate ? (
        <ContextDecisionSheet
          visible={sheetVisible}
          title={contextCandidate.title}
          sourceLabel={contextCandidate.sourceLabel}
          whyRecommended={contextCandidate.whyRecommended}
          labelVariant="sheet"
          themeMode={themeMode}
          onIngest={() => {
            confirmPendingIngest();
            setSheetOpen(false);
          }}
          onSkip={() => {
            contextCandidate.onSkip();
            setSheetOpen(false);
          }}
          onDetail={() => {
            contextCandidate.onDetail();
          }}
          onDismiss={() => {
            setSheetOpen(false);
            setPendingIngestProposal(null);
          }}
        />
      ) : null}
    </View>
  );
}
