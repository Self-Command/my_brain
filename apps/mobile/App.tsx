import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { AppState, Linking, SafeAreaView, StatusBar, StyleSheet, useColorScheme, View } from "react-native";

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  useFonts,
} from "@expo-google-fonts/dm-sans";
import {
  NotoSansSC_400Regular,
  NotoSansSC_500Medium,
} from "@expo-google-fonts/noto-sans-sc";

import {
  applyIngestCreate,
  createDefaultDegradedState,
  createInitialConversationState,
  DEMO_MODE_META_KEY,
  generateAdaptiveSignals,
  inferUserModeProfileFromDialogue,
  InMemoryGraphRepository,
  InMemoryHistoryRepository,
} from "@my-brain/core";

import { ContextDecisionSheet } from "./components/ContextDecisionSheet";
import { PageHeader } from "./components/ui/PageHeader";
import { MigrationGate } from "./boot/MigrationGate";
import { useStorageBootstrap } from "./boot/storageBootstrap";
import { NavigationProvider } from "./navigation/NavigationContext";
import { RootNavigator } from "./navigation/RootNavigator";
import { BrainMapScreen } from "./screens/BrainMapScreen";
import { CaptureInboxScreen } from "./screens/CaptureInboxScreen";
import { LivingBrainHome } from "./screens/LivingBrainHome";
import { MemoryReviewScreen } from "./screens/MemoryReviewScreen";
import { LaunchScreen } from "./screens/LaunchScreen";
import { LAUNCH_MAX_MS } from "./boot/launchTiming";
import { ProviderSettingsScreen } from "./screens/ProviderSettingsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import {
  AssetCandidateFixtureScreen,
  ColdStartDialogueFixtureScreen,
  CompanionChatFixtureScreen,
  PersonalObserverFixtureScreen,
  ProfileReviewFixtureScreen,
  ProviderSettingsFixtureScreen,
  ReviewActionFixtureScreen,
  VoiceSessionFixtureScreen,
  WorldObserverFixtureScreen,
} from "./screens/companion/CompanionVisualFixtures";
import { hydrateMobileStores } from "./stores/persistHydrate";
import { scheduleLaunchBootHandoff } from "./boot/launchBootHandoff";
import { seedCompanionCredentialsFromEnvIfNeeded } from "./boot/seedCompanionCredentialsFromEnv";
import { selectMainRouteEnabledFromStore, useMobileAppStore } from "./stores/mobileAppStore";
import { useProvisionalStore } from "./stores/provisionalStore";
import { loadProviderVerification } from "./services/providerConfigStore";
import { migrateProviderProfiles, subscribeProviderProfiles } from "./services/providerProfiles";
import { getSecureCredentialStore } from "./services/secureCredentialStore";
import { getStorageSession } from "./storage/storageSession";
import { resolveThemeMode } from "./theme/appearancePreference";
import { CONTEXT_DECISION_PAGE_COPY } from "./theme/contextDecisionLabels";
import { ThemeProvider, useTheme } from "./theme/ThemeProvider";
import { wireNativeShareHandoffLifecycle } from "./capture/nativeShareHandoffLifecycle";
import { disconnectActiveVoiceSession } from "./voice/voiceAppLifecycle";
import { stopDeviceSpeech } from "./voice/deviceSpeechOutput";
import { safeArea } from "./theme/tokens";
import manifest from "./visual-fixtures/manifest.json";
import { resolveDevVisualFixtureRoute } from "./visual-fixtures/devCaptureRoute";
import { setVisualFixtureCaptureRoute } from "./visual-fixtures/captureSession";




/** Capture-only deep link: mybrain://visual-fixture/<CaptureRoute> — never skips provider gate on normal launch. */
const VISUAL_FIXTURE_PREFIX = "mybrain://visual-fixture/";
const VISUAL_FIXTURE_ALLOWED = new Set(
  (manifest.screens as Array<{ captureRoute: string }>).map((entry) => entry.captureRoute),
);

export function parseVisualFixtureCaptureRoute(
  url: string | null | undefined,
): string | null {
  if (!url) {
    return null;
  }
  const normalized = url.trim();
  if (!normalized.startsWith(VISUAL_FIXTURE_PREFIX)) {
    return null;
  }
  const route = decodeURIComponent(
    normalized.slice(VISUAL_FIXTURE_PREFIX.length).split(/[?#]/)[0] ?? "",
  );
  if (!route || !VISUAL_FIXTURE_ALLOWED.has(route)) {
    return null;
  }
  return route;
}

function seedVisualFixtureCaptureState(captureRoute: string): void {
  setVisualFixtureCaptureRoute(captureRoute);
  const profile = inferUserModeProfileFromDialogue(["我想跟进 AI 和开源"], "cold-tech-tracker");
  const graph = new InMemoryGraphRepository();
  const history = new InMemoryHistoryRepository();
  const degraded = createDefaultDegradedState(false);
  degraded.active =
    captureRoute === "BrainMapScreen"
      ? []
      : ["mock_llm", "fixture_radar", "voice_disconnected"];

  useProvisionalStore.setState({ candidates: [], lastExplanation: null, lastSsrfHint: null });

  if (captureRoute === "CaptureInboxScreen") {
    useProvisionalStore.setState({
      candidates: [
        {
          id: "visual-fixture-inbox-share-1",
          sourceType: "link",
          summary: "Graphiti 的 episode 机制",
          evidenceRefs: ["share:intent-fixture"],
          createdAt: "2026-06-20T06:00:00.000Z",
          status: "pending",
          linkUrl: "https://example.com/graphiti",
          fetchOk: true,
          ingestSource: "share",
        },
        {
          id: "visual-fixture-inbox-note-1",
          sourceType: "text",
          summary: "面试时要讲清楚为什么不是普通 RAG",
          evidenceRefs: [],
          createdAt: "2026-06-20T06:20:00.000Z",
          status: "pending",
        },
        {
          id: "visual-fixture-inbox-ocr-1",
          sourceType: "image_mock",
          summary: "识别到 3 个概念，置信度偏低",
          evidenceRefs: ["image:fixture-ocr"],
          createdAt: "2026-06-20T06:00:00.000Z",
          status: "pending",
        },
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `visual-fixture-inbox-filler-${index + 1}`,
          sourceType: "text" as const,
          summary: `星尘占位 ${index + 1}`,
          evidenceRefs: [] as string[],
          createdAt: "2026-06-20T06:00:00.000Z",
          status: "pending" as const,
          ingestSource: "provisional_pending" as const,
        })),
      ],
      lastExplanation: null,
      lastSsrfHint: null,
    });
  }

  const baseStore = {
    appearancePreference: "dark" as const,
    storageReady: true,
    demoMode: true,
    graph,
    history,
    degraded,
    conversation: createInitialConversationState(),
    pendingIngestProposal: null,
    providerVerified: false,
    providerLlmLive: false,
    providerVoiceLive: false,
  };

  if (captureRoute === "LaunchScreen" || captureRoute === "LaunchAssets") {
    useMobileAppStore.setState({
      ...baseStore,
      phase: "launch",
      coldStartComplete: false,
      visibleNodes: [],
      signals: [],
      userProfile: null,
    });
    return;
  }

  if (captureRoute === "LivingBrainHome") {
    useMobileAppStore.setState({
      ...baseStore,
      phase: "empty_invite",
      coldStartComplete: false,
      visibleNodes: [],
      signals: [],
      userProfile: null,
      degraded: createDefaultDegradedState(false),
    });
    return;
  }

  if (captureRoute === "ContextDecisionSheet") {
    useMobileAppStore.setState({
      ...baseStore,
      phase: "empty_invite",
      coldStartComplete: false,
      visibleNodes: [],
      signals: [],
      userProfile: null,
      degraded: createDefaultDegradedState(false),
    });
    useMobileAppStore.getState().completeColdStart(profile);
    const storeGraph = useMobileAppStore.getState().graph;
    const storeHistory = useMobileAppStore.getState().history;
    applyIngestCreate(
      {
        concept: "Provider 抽象",
        intro: "把模型、语音、信息源都藏在可替换接口后面。",
        sourceLinks: ["https://example.com/provider"],
      },
      { graph: storeGraph, history: storeHistory },
    );
    applyIngestCreate(
      {
        concept: "GraphChange",
        intro: "图谱结构变更与回放。",
        sourceLinks: ["signal:fixture-graph-change"],
      },
      { graph: storeGraph, history: storeHistory },
    );
    applyIngestCreate(
      {
        concept: "MemoryReplay",
        intro: "长期记忆回放能力。",
        sourceLinks: ["signal:fixture-memory-replay"],
      },
      { graph: storeGraph, history: storeHistory },
    );
    applyIngestCreate(
      {
        concept: "RAG 检索",
        intro: "检索增强生成的核心链路。",
        sourceLinks: ["signal:fixture-rag"],
      },
      { graph: storeGraph, history: storeHistory },
    );
    const snap = storeGraph.getSnapshot();
    const provider = snap.nodes.find((node) => node.concept === "Provider 抽象");
    const rag = snap.nodes.find((node) => node.concept === "RAG 检索");
    if (provider && rag) {
      storeGraph.addEdge({ fromId: provider.id, toId: rag.id, relation: "related" });
    }
    useMobileAppStore.getState().syncGraphView();
    useMobileAppStore.setState({
      phase: "adaptive_live",
      coldStartComplete: true,
      userProfile: profile,
      signals: generateAdaptiveSignals(profile),
      visibleNodes: useMobileAppStore.getState().visibleNodes,
      pendingIngestProposal: null,
      degraded: createDefaultDegradedState(false),
    });
    return;
  }

  if (captureRoute === "TodayScreen" || captureRoute === "MemoryReviewScreen") {
    useMobileAppStore.setState({
      ...baseStore,
      phase: "adaptive_live",
      coldStartComplete: true,
      visibleNodes: [],
      signals: [],
      userProfile: profile,
      degraded: createDefaultDegradedState(false),
    });
    return;
  }

  if (captureRoute === "CaptureInboxScreen" || captureRoute === "SettingsScreen") {
    useMobileAppStore.setState({
      ...baseStore,
      phase: "adaptive_live",
      coldStartComplete: true,
      visibleNodes: [],
      signals: [],
      userProfile: profile,
      degraded: createDefaultDegradedState(false),
      providerVerified: true,
      providerLlmLive: true,
      providerVoiceLive: false,
    });
    return;
  }

  if (captureRoute === "ProviderSettings") {
    useMobileAppStore.setState({
      ...baseStore,
      phase: "empty_invite",
      coldStartComplete: false,
      visibleNodes: [],
      signals: [],
      userProfile: null,
    });
    return;
  }

  const companionFixtureRoutes = new Set([
    "ColdStartDialogue",
    "VoiceSession",
    "CompanionChat",
    "ProfileReview",
    "WorldObserver",
    "PersonalObserver",
    "AssetCandidate",
    "ReviewAction",
  ]);
  if (companionFixtureRoutes.has(captureRoute)) {
    useMobileAppStore.setState({
      ...baseStore,
      phase: captureRoute === "ColdStartDialogue" ? "cold_start" : "adaptive_live",
      coldStartComplete: captureRoute !== "ColdStartDialogue",
      visibleNodes: [],
      signals: captureRoute === "ColdStartDialogue" ? [] : generateAdaptiveSignals(profile),
      userProfile: captureRoute === "ColdStartDialogue" ? null : profile,
      degraded: createDefaultDegradedState(false),
    });
    return;
  }

  useMobileAppStore.setState({
    ...baseStore,
    phase: "empty_invite",
    coldStartComplete: false,
    visibleNodes: [],
    signals: [],
    userProfile: null,
  });
  useMobileAppStore.getState().completeColdStart(profile);
  const storeGraph = useMobileAppStore.getState().graph;
  const storeHistory = useMobileAppStore.getState().history;
  applyIngestCreate(
    {
      concept: "Provider 抽象",
      intro: "把模型、语音、信息源都藏在可替换接口后面。",
      sourceLinks: ["https://example.com/provider"],
    },
    { graph: storeGraph, history: storeHistory },
  );
  applyIngestCreate(
    {
      concept: "RAG 检索",
      intro: "检索增强生成的核心链路。",
      sourceLinks: ["signal:fixture-1"],
    },
    { graph: storeGraph, history: storeHistory },
  );
  useMobileAppStore.getState().syncGraphView();

  if (captureRoute === "BrainMapScreen") {
    const snap = storeGraph.getSnapshot();
    const provider = snap.nodes.find((node) => node.concept === "Provider 抽象");
    const rag = snap.nodes.find((node) => node.concept === "RAG 检索");
    if (provider && rag) {
      storeGraph.addEdge({ fromId: provider.id, toId: rag.id, relation: "related" });
    }
  }

  useProvisionalStore.getState().addTextCapture("面试时要讲清楚为什么不是普通 RAG");
  void useProvisionalStore.getState().addLinkCapture("Graphiti episode", "https://example.com/graphiti");

  useMobileAppStore.setState({
    phase: "adaptive_live",
    coldStartComplete: true,
    userProfile: profile,
    signals: generateAdaptiveSignals(profile),
    visibleNodes: useMobileAppStore.getState().visibleNodes,
    pendingIngestProposal:
      captureRoute === "ContextDecisionSheet"
        ? {
            id: "fixture-proposal-1",
            concept: "Context Graph",
            intro: "来自视觉夹具的候选概念。",
            sourceLinks: ["signal:fixture-context"],
            createdAt: new Date().toISOString(),
          }
        : null,
  });
}

function VisualFixtureCaptureScreen({ captureRoute }: { captureRoute: string }) {
  const [fixtureReady, setFixtureReady] = useState(false);
  const seededRoute = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (seededRoute.current !== captureRoute) {
      seededRoute.current = captureRoute;
      seedVisualFixtureCaptureState(captureRoute);
    }
    setFixtureReady(true);
  }, [captureRoute]);

  const noop = useCallback(() => {}, []);

  if (!fixtureReady) {
    return (
      <View
        style={fixtureRootStyle}
        testID="visual-fixture-capture-root"
        accessibilityLabel={captureRoute}
      />
    );
  }

  let body: ReactNode;
  switch (captureRoute) {
    case "LaunchScreen":
    case "LaunchAssets":
      body = <LaunchScreen onDone={noop} />;
      break;
    case "ProviderSettings":
      body = <ProviderSettingsFixtureScreen />;
      break;
    case "LivingBrainHome":
      body = <LivingBrainHome />;
      break;
    case "TodayScreen":
      body = <TodayScreen />;
      break;
    case "CaptureInboxScreen":
      body = <CaptureInboxScreen />;
      break;
    case "BrainMapScreen":
      body = <BrainMapScreen />;
      break;
    case "MemoryReviewScreen":
      body = <MemoryReviewScreen />;
      break;
    case "SettingsScreen":
      body = <SettingsScreen />;
      break;
    case "ContextDecisionSheet":
      body = (
        <NavigationProvider>
          <View style={fixtureBackdropStyle} testID="visual-fixture-context-host">
            <View style={contextBackdropDimmed} pointerEvents="none">
              <LivingBrainHome />
            </View>
            <View style={contextScrimOverlay} pointerEvents="none" />
            <View style={contextHeaderOverlay} pointerEvents="none">
              <PageHeader
                variant="contract"
                title={CONTEXT_DECISION_PAGE_COPY.title}
                subtitle={CONTEXT_DECISION_PAGE_COPY.subtitle}
                testID="context-decision-page-header"
              />
            </View>
            <ContextDecisionSheet
              visible
              inlineCapture
              title="Graphiti 的 episode 机制"
              sourceLabel="候选 · 分享链接"
              description={"这条可能和你的长期记忆、图谱整理、\n回放能力有关。确认前不会写入永久星图。"}
              whyRecommended={"命中 3 个节点：Provider 抽象、GraphChange、\nMemoryReplay"}
              labelVariant="sheet"
              onIngest={noop}
              onSkip={noop}
              onDetail={noop}
              onDismiss={noop}
            />
          </View>
        </NavigationProvider>
      );
      break;
    case "ColdStartDialogue":
      body = <ColdStartDialogueFixtureScreen />;
      break;
    case "VoiceSession":
      body = <VoiceSessionFixtureScreen />;
      break;
    case "CompanionChat":
      body = <CompanionChatFixtureScreen />;
      break;
    case "ProfileReview":
      body = <ProfileReviewFixtureScreen />;
      break;
    case "WorldObserver":
      body = <WorldObserverFixtureScreen />;
      break;
    case "PersonalObserver":
      body = <PersonalObserverFixtureScreen />;
      break;
    case "AssetCandidate":
      body = <AssetCandidateFixtureScreen />;
      break;
    case "ReviewAction":
      body = <ReviewActionFixtureScreen />;
      break;
    default:
      body = (
        <View style={fixtureBackdropStyle} testID="visual-fixture-unknown-route">
          <LaunchScreen onDone={noop} />
        </View>
      );
      break;
  }

  const needsNavigation =
    captureRoute !== "LaunchScreen" &&
    captureRoute !== "LaunchAssets" &&
    captureRoute !== "ProviderSettings" &&
    captureRoute !== "ContextDecisionSheet" &&
    captureRoute !== "ColdStartDialogue" &&
    captureRoute !== "VoiceSession" &&
    captureRoute !== "CompanionChat" &&
    captureRoute !== "ProfileReview" &&
    captureRoute !== "WorldObserver" &&
    captureRoute !== "PersonalObserver" &&
    captureRoute !== "AssetCandidate" &&
    captureRoute !== "ReviewAction";

  return (
    <View
      style={fixtureRootStyle}
      testID="visual-fixture-capture-root"
      accessibilityLabel={captureRoute}
    >
      {needsNavigation ? <NavigationProvider>{body}</NavigationProvider> : body}
    </View>
  );
}

const fixtureRootStyle = { flex: 1 };
const fixtureBackdropStyle = { flex: 1, backgroundColor: safeArea.statusBarBackground.dark };
const contextBackdropDimmed = {
  ...StyleSheet.absoluteFillObject,
  opacity: 0.42,
  transform: [{ translateY: 32 }],
};
const contextScrimOverlay = {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: "rgba(0,0,0,0.18)",
};
const contextHeaderOverlay = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  zIndex: 1,
};

const VISUAL_FIXTURE_URL_POLL_MS = 400;
const VISUAL_FIXTURE_URL_POLL_MAX = 60;

function useVisualFixtureCaptureRoute(enabled: boolean): { captureRoute: string | null; isResolvingInitialUrl: boolean } {
  const devRouteOnBoot = __DEV__ ? resolveDevVisualFixtureRoute() : null;
  const [captureRoute, setCaptureRoute] = useState<string | null>(devRouteOnBoot);
  const [isResolvingInitialUrl, setIsResolvingInitialUrl] = useState(
    __DEV__ ? enabled && !devRouteOnBoot : false,
  );

  useLayoutEffect(() => {
    if (!enabled || !__DEV__) {
      return;
    }
    const devRoute = resolveDevVisualFixtureRoute();
    if (devRoute) {
      setCaptureRoute(devRoute);
      setIsResolvingInitialUrl(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setIsResolvingInitialUrl(false);
      return;
    }
    if (!__DEV__) {
      setIsResolvingInitialUrl(false);
      return;
    }
    if (resolveDevVisualFixtureRoute()) {
      return;
    }
    setIsResolvingInitialUrl(true);
    let active = true;

    const finishResolve = () => {
      if (active) {
        setIsResolvingInitialUrl(false);
      }
    };

    const applyUrl = (url: string | null | undefined) => {
      const route = parseVisualFixtureCaptureRoute(url);
      if (active && route) {
        setCaptureRoute(route);
        setIsResolvingInitialUrl(false);
      }
    };

    void Linking.getInitialURL().then((url) => {
      applyUrl(url);
      if (active && !parseVisualFixtureCaptureRoute(url)) {
        finishResolve();
      }
    });
    const subscription = Linking.addEventListener("url", (event) => {
      applyUrl(event.url);
    });

    let polls = 0;
    const pollId = setInterval(() => {
      polls += 1;
      void Linking.getInitialURL().then((url) => {
        applyUrl(url);
        if (active && !parseVisualFixtureCaptureRoute(url)) {
          clearInterval(pollId);
          finishResolve();
        }
      });
      if (polls >= VISUAL_FIXTURE_URL_POLL_MAX) {
        clearInterval(pollId);
        finishResolve();
      }
    }, VISUAL_FIXTURE_URL_POLL_MS);

    return () => {
      active = false;
      clearInterval(pollId);
      subscription.remove();
    };
  }, [enabled]);

  return { captureRoute, isResolvingInitialUrl };
}

function VisualFixtureCaptureGate({ captureRoute }: { captureRoute: string }) {
  return (
    <ThemeProvider mode="dark">
      <AppStatusBar />
      <VisualFixtureCaptureScreen captureRoute={captureRoute} />
    </ThemeProvider>
  );
}


function AppStatusBar() {

  const { mode, colors } = useTheme();

  return (
    <StatusBar
      barStyle={mode === "light" ? "dark-content" : "light-content"}
      backgroundColor={colors.background}
    />
  );

}



function ProviderLaunchGate() {
  return (
    <ThemeProvider>
      <AppStatusBar />
      <ProviderSettingsScreen launchGate />
    </ThemeProvider>
  );
}

function ThemedAppShell() {
  const mainRouteEnabled = useMobileAppStore((s) => selectMainRouteEnabledFromStore(s));

  if (!mainRouteEnabled) {
    return <ProviderLaunchGate />;
  }

  return (
    <ThemeProvider>
      <AppStatusBar />
      <RootNavigator />
    </ThemeProvider>
  );
}



export default function App() {
  useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    NotoSansSC_400Regular,
    NotoSansSC_500Medium,
  });

  return <AppShell />;
}

function AppShell() {
  const phase = useMobileAppStore((s) => s.phase);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if (
        prevState === "active" &&
        (nextState === "background" || nextState === "inactive")
      ) {
        disconnectActiveVoiceSession();
        stopDeviceSpeech();
      }
    });
    return () => subscription.remove();
  }, []);

  const storageReady = useMobileAppStore((s) => s.storageReady);

  const appearancePreference = useMobileAppStore((s) => s.appearancePreference);

  const finishLaunch = useMobileAppStore((s) => s.finishLaunch);

  const onLaunchDone = useCallback(() => finishLaunch(), [finishLaunch]);

  const systemScheme = useColorScheme();

  const bootThemeMode = resolveThemeMode(

    appearancePreference,

    systemScheme === "light" ? "light" : "dark",

  );



  const onHydrated = useCallback((bundle: Parameters<typeof hydrateMobileStores>[0]) => {

    const session = getStorageSession();

    const demoMode = session?.storage.getMeta(DEMO_MODE_META_KEY) === "true";

    hydrateMobileStores(bundle, useMobileAppStore.getState().hasApiKey, demoMode);

    useMobileAppStore.getState().hydrateAppearancePreference();

    if (useMobileAppStore.getState().phase === "launch") {
      scheduleLaunchBootHandoff();
    }

    // Defer provider verification so SQLite + store writes cannot block launch timers.
    queueMicrotask(() => {
      void (async () => {
        try { await migrateProviderProfiles(getSecureCredentialStore()); }
        catch (failure) { console.warn("provider migration incomplete", failure instanceof Error ? failure.message : "migration error"); }
        if (__DEV__) {
          try {
            await seedCompanionCredentialsFromEnvIfNeeded();
          } catch {
            // Fall back to persisted verification below.
          }
        }
        if (!useMobileAppStore.getState().providerVerified) {
          const savedVerification = loadProviderVerification();
          useMobileAppStore.getState().applyProviderVerification(savedVerification);
        }
        wireNativeShareHandoffLifecycle();
      })();
    });

  }, []);



  const { status, error, schemaVersion, retry } = useStorageBootstrap(onHydrated);

  useEffect(() => subscribeProviderProfiles(() => {
    useMobileAppStore.getState().applyProviderVerification(loadProviderVerification());
  }), []);

  const { captureRoute: visualFixtureRoute, isResolvingInitialUrl: visualFixtureResolving } =
    useVisualFixtureCaptureRoute(status === "ready");

  useEffect(() => {
    if (status === "ready" && phase === "launch") {
      scheduleLaunchBootHandoff();
    }
  }, [status, phase]);

  useEffect(() => {
    if (status !== "ready" || phase !== "launch") {
      return;
    }
    const handoffTimer = setTimeout(() => {
      if (useMobileAppStore.getState().phase === "launch") {
        useMobileAppStore.getState().finishLaunch();
      }
    }, LAUNCH_MAX_MS);
    return () => clearTimeout(handoffTimer);
  }, [status, phase]);

  // Failsafe: some Android builds drop setTimeout during early boot; poll until handoff.
  useEffect(() => {
    if (status !== "ready" || phase !== "launch" || visualFixtureRoute) {
      return;
    }
    const shownAt = Date.now();
    const pollId = setInterval(() => {
      if (useMobileAppStore.getState().phase !== "launch") {
        clearInterval(pollId);
        return;
      }
      if (Date.now() - shownAt >= LAUNCH_MAX_MS) {
        useMobileAppStore.getState().finishLaunch();
        clearInterval(pollId);
      }
    }, 250);
    return () => clearInterval(pollId);
  }, [status, phase, visualFixtureRoute]);

  const fixtureShellActive = Boolean(visualFixtureRoute || visualFixtureResolving);
  const Shell = fixtureShellActive ? View : SafeAreaView;

  return (

    <Shell

      style={[

        styles.root,

        bootThemeMode === "light" ? styles.rootLight : styles.rootDark,

      ]}

    >

      {status !== "ready" ? (

        <>

          <StatusBar
            barStyle={bootThemeMode === "light" ? "dark-content" : "light-content"}
            backgroundColor={safeArea.statusBarBackground[bootThemeMode]}
          />

          <MigrationGate

            status={status}

            schemaVersion={schemaVersion}

            errorMessage={error}

            onRetry={retry}

          />

        </>

      ) : visualFixtureResolving ? (

        <ThemeProvider>

          <AppStatusBar />

          <View
            style={[styles.root, styles.rootDark]}
            testID="visual-fixture-capture-root"
            accessibilityLabel="pending"
          />

        </ThemeProvider>

      ) : visualFixtureRoute ? (

        <VisualFixtureCaptureGate captureRoute={visualFixtureRoute} />

      ) : phase === "launch" ? (

        <>

          <StatusBar
            barStyle={bootThemeMode === "light" ? "dark-content" : "light-content"}
            backgroundColor={safeArea.statusBarBackground[bootThemeMode]}
          />

          <LaunchScreen onDone={onLaunchDone} />

        </>

      ) : storageReady ? (

        <ThemedAppShell />

      ) : (

        <>

          <StatusBar
            barStyle={bootThemeMode === "light" ? "dark-content" : "light-content"}
            backgroundColor={safeArea.statusBarBackground[bootThemeMode]}
          />

          <MigrationGate status="migrating" schemaVersion={schemaVersion} />

        </>

      )}

    </Shell>

  );

}



const styles = StyleSheet.create({

  root: {

    flex: 1,

  },

  rootDark: {

    backgroundColor: safeArea.statusBarBackground.dark,

  },

  rootLight: {

    backgroundColor: safeArea.statusBarBackground.light,

  },

});


