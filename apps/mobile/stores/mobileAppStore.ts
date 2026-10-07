import { create } from "zustand";

import type {
  AdaptiveSignal,
  ConversationState,
  DegradedModeCode,
  DegradedModeState,
  EphemeralConversationState,
  GraphNode,
  LearningTraceRecord,
  M5SignatureExperiences,
  ProfileCorrectionState,
  ProviderConfigSnapshot,
  UserModeProfile,
  PendingIngestProposal,
} from "@my-brain/core";
import {
  InMemoryGraphRepository,
  InMemoryHistoryRepository,
  applyCorrectionToProfile,
  applyIngestCreate,
  applyProfileCorrection,
  buildProviderStatusFromDegraded,
  createDefaultDegradedState,
  createEmptyCorrectionState,
  createInitialConversationState,
  createEphemeralConversation,
  deriveDegradedFromProviderSnapshot,
  generateAdaptiveSignals,
  seedTraitsFromProfile,
  DEMO_MODE_META_KEY,
  type FirstStarCandidate,
  type ProviderStatusLiveOverrides,
} from "@my-brain/core";

import {
  buildTodayEntryViewModels,
  type TodayEntryViewModel,
} from "../components/todayEntryModel";
import { buildMobileM5Experiences } from "../memory/buildExperiences";
import { getM5CaptureCandidates } from "../memory/m5CaptureBridge";
import { navigationGoBack, navigationNavigate } from "../navigation/navigationBridge";
import { Routes } from "../navigation/routes";
import { persistMobileState, visibleNodesFromGraph } from "./persistHydrate";
import type { AppearancePreference } from "../theme/appearancePreference";
import { APPEARANCE_META_KEY } from "../theme/appearancePreference";
import { getStorageSession } from "../storage/storageSession";
import { resolveMobileRadarSignals } from "../radar/mobileRadarRuntime";
import {
  loadProviderVerification,
  saveProviderVerification,
  selectMainRouteEnabled,
  type ProviderVerificationState,
} from "../services/providerConfigStore";

export type HomePhase = "launch" | "empty_invite" | "cold_start" | "adaptive_live";

export interface MobileAppState {
  phase: HomePhase;
  coldStartComplete: boolean;
  firstStarCreated: boolean;
  userProfile: UserModeProfile | null;
  signals: AdaptiveSignal[];
  correctionState: ProfileCorrectionState;
  degraded: DegradedModeState;
  conversation: ConversationState;
  ephemeralChat: EphemeralConversationState | null;
  companionChatOpen: boolean;
  assetCandidateTargetId: string | null;
  graph: InMemoryGraphRepository;
  history: InMemoryHistoryRepository;
  visibleNodes: GraphNode[];
  m5Experiences: M5SignatureExperiences | null;
  learningTraces: LearningTraceRecord[];
  replayCursor: string | null;
  lastIngestSummary: string | null;
  settingsOpen: boolean;
  profileReviewOpen: boolean;
  queueSheetOpen: boolean;
  hasApiKey: boolean;
  providerVerified: boolean;
  providerLlmLive: boolean;
  providerVoiceLive: boolean;
  storageReady: boolean;
  pendingIngestProposal: PendingIngestProposal | null;
  providerStatus: ProviderConfigSnapshot;
  persistWarnings: Array<"history_persist_warning" | "learning_trace_persist_warning" | "storage_degraded">;
  /** Labeled demo seed active — set by demo reset, never silent permanent writes. */
  demoMode: boolean;
  appearancePreference: AppearancePreference;
  setHasApiKey: (v: boolean) => void;
  applyProviderVerification: (verification: ProviderVerificationState) => void;
  clearProviderVerification: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openProfileReview: () => void;
  closeProfileReview: () => void;
  setQueueSheetOpen: (v: boolean) => void;
  finishLaunch: () => void;
  startColdStart: () => void;
  completeColdStart: (profile: UserModeProfile) => void;
  completeColdStartWithFirstStar: (profile: UserModeProfile, star: FirstStarCandidate) => void;
  refreshRadar: () => Promise<void>;
  setConversation: (c: ConversationState) => void;
  startEphemeralChat: () => void;
  setEphemeralChat: (state: EphemeralConversationState) => void;
  openCompanionChat: () => void;
  closeCompanionChat: () => void;
  openAssetCandidate: (candidateId: string) => void;
  closeAssetCandidate: () => void;
  syncGraphView: () => void;
  refreshM5Experiences: () => void;
  setLastIngestSummary: (s: string | null) => void;
  applyCorrection: (traitId: string, action: "suppress" | "restore") => void;
  setPendingIngestProposal: (p: PendingIngestProposal | null) => void;
  flushPersist: () => void;
  addPersistWarning: (code: MobileAppState["persistWarnings"][number]) => void;
  setVoiceDisconnected: (disconnected: boolean) => void;
  setAppearancePreference: (pref: AppearancePreference) => void;
  hydrateAppearancePreference: () => void;
}

function providerLiveOverrides(
  state: Pick<MobileAppState, "providerLlmLive" | "providerVoiceLive">,
): ProviderStatusLiveOverrides {
  return {
    llmLive: state.providerLlmLive,
    voiceLive: state.providerVoiceLive,
  };
}

function panelStatusFromState(
  state: Pick<
    MobileAppState,
    "degraded" | "providerStatus" | "persistWarnings" | "providerLlmLive" | "providerVoiceLive"
  >,
): ProviderConfigSnapshot {
  const storageStatus = state.persistWarnings.includes("storage_degraded")
    ? "degraded"
    : state.providerStatus.storage;
  return buildProviderStatusFromDegraded(
    state.degraded,
    storageStatus,
    providerLiveOverrides(state),
  );
}

function degradedAfterVerification(
  verification: ProviderVerificationState,
  state: Pick<MobileAppState, "hasApiKey" | "coldStartComplete" | "providerStatus" | "degraded">,
): DegradedModeState {
  if (verification.verified && verification.voiceLive) {
    return { active: [], providerMode: "live" };
  }
  let active = state.degraded.active.filter(
    (code) =>
      code !== "profile_seed_degraded" || !state.coldStartComplete,
  );
  if (verification.llmLive) {
    active = active.filter((code) => code !== "mock_llm");
  }
  if (verification.voiceLive) {
    active = active.filter((code) => code !== "voice_disconnected");
  }
  const providerStatus: ProviderConfigSnapshot = {
    ...state.providerStatus,
    llm: verification.llmLive ? "live" : state.providerStatus.llm,
    voice: verification.voiceLive ? "connected" : "disconnected",
  };
  return deriveDegradedFromProviderSnapshot(
    providerStatus,
    state.hasApiKey || verification.llmLive,
    state.coldStartComplete,
  );
}

export function selectMainRouteEnabledFromStore(
  state: Pick<
    MobileAppState,
    "providerVerified" | "providerLlmLive" | "providerVoiceLive"
  >,
): boolean {
  return selectMainRouteEnabled({
    verified: state.providerVerified,
    llmLive: state.providerLlmLive,
    voiceLive: state.providerVoiceLive,
  });
}

/** Today rows from signals + graph/history — screens stay thin. */
export function selectTodayEntryViewModels(
  state: Pick<MobileAppState, "userProfile" | "signals" | "graph" | "history">,
  pendingCaptureCount: number,
): TodayEntryViewModel[] {
  return buildTodayEntryViewModels(
    state.userProfile,
    state.signals,
    pendingCaptureCount,
    state.graph,
    state.history,
  );
}

export function selectStorageGraphEmpty(
  state: Pick<MobileAppState, "graph" | "history" | "storageReady">,
): boolean {
  if (!state.storageReady) {
    return false;
  }
  return (
    state.graph.countVisibleNodes() === 0 && state.history.listChanges().length === 0
  );
}

function refreshM5FromState(get: () => MobileAppState): M5SignatureExperiences | null {
  const state = get();
  return buildMobileM5Experiences({
    profile: state.userProfile,
    graph: state.graph,
    history: state.history,
    captures: getM5CaptureCandidates(),
    learningTraces: state.learningTraces,
    replayCursor: state.replayCursor,
    learningTraceWarning: state.persistWarnings.includes("learning_trace_persist_warning"),
  });
}

export const useMobileAppStore = create<MobileAppState>((set, get) => ({
  phase: "launch",
  coldStartComplete: false,
  firstStarCreated: false,
  userProfile: null,
  signals: [],
  correctionState: createEmptyCorrectionState(),
  degraded: createDefaultDegradedState(false),
  conversation: createInitialConversationState(),
  ephemeralChat: null,
  companionChatOpen: false,
  assetCandidateTargetId: null,
  graph: new InMemoryGraphRepository(),
  history: new InMemoryHistoryRepository(),
  visibleNodes: [],
  m5Experiences: null,
  learningTraces: [],
  replayCursor: null,
  lastIngestSummary: null,
  settingsOpen: false,
  profileReviewOpen: false,
  queueSheetOpen: false,
  hasApiKey: false,
  providerVerified: false,
  providerLlmLive: false,
  providerVoiceLive: false,
  storageReady: false,
  pendingIngestProposal: null,
  providerStatus: {
    llm: "mock",
    radar: "fixture",
    voice: "disconnected",
    storage: "migrating",
  },
  persistWarnings: [],
  demoMode: false,
  appearancePreference: "dark",
  setHasApiKey: (v) => {
    const providerSnapshot = v
      ? get().providerStatus
      : {
          ...get().providerStatus,
          llm: "mock" as const,
          radar: "fixture" as const,
          voice: "disconnected" as const,
        };
    const degraded = deriveDegradedFromProviderSnapshot(
      providerSnapshot,
      v,
      get().coldStartComplete,
    );
    set({
      hasApiKey: v,
      degraded,
      providerStatus: buildProviderStatusFromDegraded(degraded, get().providerStatus.storage),
      ...(v ? {} : { providerVerified: false, providerLlmLive: false, providerVoiceLive: false }),
    });
    if (!v) {
      saveProviderVerification({ verified: false, llmLive: false, voiceLive: false });
    }
    get().flushPersist();
  },
  applyProviderVerification: (verification) => {
    const state = get();
    const providerStatus: ProviderConfigSnapshot = {
      ...state.providerStatus,
      llm: verification.llmLive ? "live" : "degraded",
      voice: verification.voiceLive ? "connected" : "disconnected",
    };
    const degraded = degradedAfterVerification(verification, {
      ...state,
      providerStatus,
    });
    set({
      providerVerified: verification.verified,
      providerLlmLive: verification.llmLive,
      providerVoiceLive: verification.voiceLive,
      providerStatus: panelStatusFromState({
        ...state,
        degraded,
        providerStatus,
        providerLlmLive: verification.llmLive,
        providerVoiceLive: verification.voiceLive,
      }),
      degraded,
      demoMode: verification.verified ? false : state.demoMode,
      hasApiKey: state.hasApiKey || verification.llmLive,
    });
    if (verification.verified) {
      getStorageSession()?.storage.deleteMeta(DEMO_MODE_META_KEY);
    }
    saveProviderVerification(verification);
    get().flushPersist();
  },
  clearProviderVerification: () => {
    const cleared = { verified: false, llmLive: false, voiceLive: false };
    set({
      providerVerified: false,
      providerLlmLive: false,
      providerVoiceLive: false,
    });
    saveProviderVerification(cleared);
    get().flushPersist();
  },
  openSettings: () => {
    set({ settingsOpen: true });
    navigationNavigate(Routes.Settings);
  },
  closeSettings: () => {
    set({ settingsOpen: false, profileReviewOpen: false });
    navigationGoBack();
  },
  openProfileReview: () => {
    set({ profileReviewOpen: true, settingsOpen: true });
    navigationNavigate(Routes.Settings);
  },
  closeProfileReview: () => set({ profileReviewOpen: false }),
  setQueueSheetOpen: (v) => set({ queueSheetOpen: v }),
  finishLaunch: () =>
    set((s) => ({
      phase: !selectMainRouteEnabledFromStore(s)
        ? "empty_invite"
        : s.coldStartComplete
          ? "adaptive_live"
          : "empty_invite",
    })),
  startColdStart: () => set({ phase: "cold_start" }),
  completeColdStart: (profile) => {
    const correctionState = {
      ...createEmptyCorrectionState(),
      traits: seedTraitsFromProfile(profile),
    };
    const signals = generateAdaptiveSignals(profile, correctionState.suppressionList);
    const graph = get().graph;
    const clearedDegraded: DegradedModeState = {
      ...get().degraded,
      active: get().degraded.active.filter((code) => code !== "profile_seed_degraded"),
    };
    const storageStatus = get().persistWarnings.includes("storage_degraded")
      ? "degraded"
      : get().providerStatus.storage;
    set({
      phase: "adaptive_live",
      coldStartComplete: true,
      userProfile: profile,
      correctionState,
      signals,
      visibleNodes: visibleNodesFromGraph(graph),
      m5Experiences: refreshM5FromState(get),
      degraded: clearedDegraded,
      providerStatus: panelStatusFromState({
        ...get(),
        degraded: clearedDegraded,
      }),
    });
    void get().refreshRadar();
    get().flushPersist();
  },
  completeColdStartWithFirstStar: (profile, star) => {
    const graph = get().graph;
    const history = get().history;
    applyIngestCreate(
      {
        concept: star.concept,
        intro: star.intro,
        sourceLinks: star.sourceLinks,
      },
      { graph, history },
    );
    get().syncGraphView();
    get().completeColdStart(profile);
    set({ firstStarCreated: true, lastIngestSummary: star.concept });
  },
  refreshRadar: async () => {
    const { userProfile, correctionState, graph } = get();
    if (!userProfile) {
      return;
    }
    const corrected = applyCorrectionToProfile(userProfile, correctionState);
    const radar = await resolveMobileRadarSignals({
      profile: corrected,
      suppressionList: correctionState.suppressionList,
    });
    const preservedActive = get().degraded.active.filter(
      (code) => code !== "mock_llm" && code !== "fixture_radar",
    );
    const degraded: DegradedModeState = {
      providerMode: radar.providerMode,
      active: [...preservedActive, ...radar.activeCodes],
    };
    set({
      userProfile: corrected,
      signals: radar.signals,
      degraded,
      providerStatus: panelStatusFromState({
        ...get(),
        degraded,
      }),
      m5Experiences: refreshM5FromState(get),
    });
    get().flushPersist();
  },
  setConversation: (c) => set({ conversation: c }),
  startEphemeralChat: () => {
    const existing = get().ephemeralChat;
    if (existing) {
      return;
    }
    set({ ephemeralChat: createEphemeralConversation() });
  },
  setEphemeralChat: (state) => set({ ephemeralChat: state }),
  openCompanionChat: () => {
    get().startEphemeralChat();
    set({ companionChatOpen: true });
  },
  closeCompanionChat: () => set({ companionChatOpen: false }),
  openAssetCandidate: (candidateId) => set({ assetCandidateTargetId: candidateId }),
  closeAssetCandidate: () => set({ assetCandidateTargetId: null }),
  syncGraphView: () => {
    const { graph } = get();
    set({
      visibleNodes: visibleNodesFromGraph(graph),
      m5Experiences: refreshM5FromState(get),
    });
  },
  refreshM5Experiences: () => {
    set({ m5Experiences: refreshM5FromState(get) });
  },
  setLastIngestSummary: (s) => set({ lastIngestSummary: s }),
  applyCorrection: (traitId, action) => {
    const state = get();
    const correctionState = applyProfileCorrection(
      state.correctionState,
      traitId,
      action,
    );
    set({ correctionState });
    void get().refreshRadar();
    get().flushPersist();
  },
  setPendingIngestProposal: (p) => {
    set({ pendingIngestProposal: p });
    get().flushPersist();
  },
  flushPersist: () => {
    if (!get().storageReady) {
      return;
    }
    const state = get();
    const storageStatus = state.persistWarnings.includes("storage_degraded")
      ? "degraded"
      : state.providerStatus.storage;
    set({
      providerStatus: panelStatusFromState(get()),
    });
    persistMobileState();
  },
  addPersistWarning: (code) => {
    const warnings = get().persistWarnings;
    if (!warnings.includes(code)) {
      set({ persistWarnings: [...warnings, code] });
    }
  },
  setVoiceDisconnected: (disconnected) => {
    set((s) => {
      const active: DegradedModeCode[] = disconnected
        ? s.degraded.active.includes("voice_disconnected")
          ? s.degraded.active
          : [...s.degraded.active, "voice_disconnected"]
        : s.degraded.active.filter((code) => code !== "voice_disconnected");
      const degraded: DegradedModeState = { ...s.degraded, active };
      return {
        degraded,
        providerStatus: panelStatusFromState({
          ...s,
          degraded,
        }),
      };
    });
    get().flushPersist();
  },
  setAppearancePreference: (pref) => {
    set({ appearancePreference: pref });
    getStorageSession()?.storage.setMeta(APPEARANCE_META_KEY, pref);
  },
  hydrateAppearancePreference: () => {
    const stored = getStorageSession()?.storage.getMeta(APPEARANCE_META_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      set({ appearancePreference: stored });
    }
  },
}));
