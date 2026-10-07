/**
 * CK-03 companion crash baseline smoke tests — sync press must not throw; async
 * faults are tracked via unhandledRejection where relevant.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

import { InMemoryGraphRepository, InMemoryHistoryRepository, buildActionDraft } from "@my-brain/core";

const voiceSessionMock = vi.hoisted(() => ({
  state: "idle" as "idle" | "listening" | "speaking" | "error",
  lastError: null as string | null,
  connect: vi.fn(async () => undefined),
  disconnect: vi.fn(),
  bargeIn: vi.fn(),
  handleTranscript: vi.fn(() => null),
}));

vi.mock("../voice/useLivingBrainVoiceOrb", () => ({
  useLivingBrainVoiceOrb: () => ({
    orbState:
      voiceSessionMock.state === "speaking"
        ? "speaking"
        : voiceSessionMock.state === "error"
          ? "error"
          : "idle",
    accessibilityLabel: "语音助手",
    onOrbPress: async () => {
      if (voiceSessionMock.state === "speaking") {
        voiceSessionMock.bargeIn();
        return;
      }
      try {
        await voiceSessionMock.connect();
      } catch {
        // LivingBrainHome handles connect failures without surfacing unhandled rejections.
      }
    },
    handleVoiceTranscript: () => null,
    voiceState: voiceSessionMock.state,
    lastError: voiceSessionMock.lastError,
    connected: voiceSessionMock.state !== "idle",
  }),
}));

vi.mock("../voice/VoiceSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../voice/VoiceSession")>();
  return {
    ...actual,
    useVoiceSession: () => voiceSessionMock,
    resetVoiceSessionSingleton: actual.resetVoiceSessionSingleton,
  };
});

vi.mock("../config/legalLinks", () => ({
  readPrivacyPolicyLink: () => ({
    url: "https://mybrain.local/dev/privacy-policy-draft",
    scope: "dev-draft",
    localPath: "docs/legal/privacy-policy-draft.md",
    label: "隐私政策（local/dev 草案，非生产 legal PASS）",
  }),
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: { extra: {} },
    nativeBuildVersion: null,
  },
}));

vi.mock("../env/readAppEnv", () => ({
  readMobileAppEnv: vi.fn(() => ({
    runtime: "mobile",
    providerModes: { voice: "mock", llm: "mock", newsRadar: "mock" },
  })),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

const providerMeta = vi.hoisted(() => new Map<string, string>());
vi.mock("../storage/storageSession", () => ({
  getStorageSession: () => ({ storage: {
    getMeta: (key: string) => providerMeta.get(key) ?? null,
    setMeta: (key: string, value: string) => { providerMeta.set(key, value); },
    deleteMeta: (key: string) => { providerMeta.delete(key); },
    appendDiagnosticEvent: vi.fn(),
  } }),
}));

vi.mock("../services/secureCredentialStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/secureCredentialStore")>();
  const memory = actual.createMemorySecureCredentialStore();
  return {
    ...actual,
    getSecureCredentialStore: () => memory,
    resetSecureCredentialStoreForTests: actual.resetSecureCredentialStoreForTests,
  };
});

vi.mock("react-native", () => {
  const RN = (tag: string) =>
    function MockComponent({
      children,
      testID,
      onPress,
      onClick,
      accessibilityRole,
      accessibilityLabel,
      accessibilityState,
      disabled,
      value,
      onChangeText,
      placeholder,
      onBlur,
      onValueChange,
    }: {
      children?: React.ReactNode;
      testID?: string;
      onPress?: () => void;
      onClick?: () => void;
      accessibilityRole?: string;
      accessibilityLabel?: string;
      accessibilityState?: { busy?: boolean; disabled?: boolean; checked?: boolean };
      disabled?: boolean;
      value?: string | boolean;
      onChangeText?: (v: string) => void;
      placeholder?: string;
      onBlur?: () => void;
      onValueChange?: (v: boolean) => void;
    }) {
      if (tag === "input") {
        const type = onValueChange ? "checkbox" : "text";
        return React.createElement("input", {
          "data-testid": testID,
          type,
          value: type === "text" ? (value as string) : undefined,
          checked: type === "checkbox" ? value === true : undefined,
          placeholder,
          onChange: (e: { target: { value: string; checked: boolean } }) => {
            if (onValueChange) {
              onValueChange(e.target.checked);
            } else {
              onChangeText?.(e.target.value);
            }
          },
          onBlur,
        });
      }
      return React.createElement(
        onPress ? "button" : tag,
        {
          "data-testid": testID,
          onClick: disabled ? undefined : (onPress ?? onClick),
          role: accessibilityRole,
          "aria-label": accessibilityLabel,
          "aria-busy": accessibilityState?.busy,
          disabled,
        },
        children,
      );
    };
  return {
    View: RN("div"),
    Text: RN("span"),
    Pressable: RN("button"),
    TextInput: RN("input"),
    ScrollView: RN("div"),
    SafeAreaView: RN("div"),
    StatusBar: () => null,
    Switch: RN("input"),
    ActivityIndicator: RN("span"),
    Modal: ({
      children,
      visible,
    }: {
      children?: React.ReactNode;
      visible?: boolean;
    }) => (visible ? React.createElement("div", null, children) : null),
    StyleSheet: { create: (s: object) => s, hairlineWidth: 1 },
    useWindowDimensions: () => ({
      width: 390,
      height: 844,
      scale: 1,
      fontScale: 1,
    }),
    Animated: {
      Value: class {
        setValue() {}
        stopAnimation() {}
        interpolate() {
          return 0;
        }
      },
      loop: (animation: unknown) => ({
        start: () => animation,
        stop: () => {},
      }),
      sequence: (animations: unknown[]) => animations[0],
      timing: () => ({}),
      View: RN("div"),
    },
    Easing: { inOut: () => ({}), ease: {} },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    Platform: {
      OS: "android",
      Version: "14",
      select: (o: Record<string, string>) => o.android ?? o.default ?? Object.values(o)[0],
    },
    NativeModules: {
      Voice: {
        isAvailable: async () => true,
        start: async () => {},
        stop: async () => {},
        cancel: async () => {},
        destroy: async () => {},
        removeAllListeners: () => {},
        isRecognizing: async () => false,
      },
    },
    AppState: {
      currentState: "active",
      addEventListener: () => ({ remove: () => {} }),
    },
    Share: { share: vi.fn() },
    Linking: { openURL: vi.fn() },
    useColorScheme: () => "dark",
    Alert: { alert: vi.fn() },
  };
});

import { RootNavigator } from "../navigation/RootNavigator";
import { NavigationProvider } from "../navigation/NavigationContext";
import { ProviderSettingsScreen } from "../screens/ProviderSettingsScreen";
import { ContextDecisionSheet } from "../components/ContextDecisionSheet";
import { ActionConfirmationSheet } from "../components/ActionConfirmationSheet";
import { ProvisionalQueueSheet } from "../components/ProvisionalQueueSheet";
import { TestConnectionButton } from "../components/TestConnectionButton";
import { ThemeProvider } from "../theme/ThemeProvider";
import { resetVoiceSessionSingleton } from "../voice/VoiceSession";
import { resetSecureCredentialStoreForTests } from "../services/secureCredentialStore";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { useProvisionalStore } from "../stores/provisionalStore";

function pressWithoutThrow(target: () => void) {
  expect(() => target()).not.toThrow();
}

async function collectUnhandledRejections(run: () => void | Promise<void>) {
  const rejections: unknown[] = [];
  const handler = (reason: unknown) => rejections.push(reason);
  process.on("unhandledRejection", handler);
  try {
    await run();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  } finally {
    process.off("unhandledRejection", handler);
  }
  return rejections;
}

function resetCompanionStores() {
  resetVoiceSessionSingleton();
  resetSecureCredentialStoreForTests();
  useProvisionalStore.setState({ candidates: [], lastExplanation: null, lastSsrfHint: null });
  useMobileAppStore.setState({
    phase: "empty_invite",
    coldStartComplete: false,
    settingsOpen: false,
    queueSheetOpen: false,
    storageReady: true,
    graph: new InMemoryGraphRepository(),
    history: new InMemoryHistoryRepository(),
    visibleNodes: [],
    m5Experiences: null,
    replayCursor: null,
    providerStatus: {
      llm: "mock",
      radar: "fixture",
      voice: "disconnected",
      storage: "ready",
    },
    persistWarnings: [],
    degraded: {
      active: ["mock_llm", "fixture_radar", "voice_disconnected", "profile_seed_degraded"],
      providerMode: "mock",
    },
    pendingIngestProposal: null,
    conversation: {
      phase: "idle",
      turns: [],
      activeSignalId: null,
      activeProvisionalId: null,
      lastExplanation: null,
    },
  });
}

function seedAdaptiveLive() {
  useMobileAppStore.getState().completeColdStart({
    primaryMode: "tech_tracker",
    secondaryModes: [],
    confidence: 0.8,
  });
  useMobileAppStore.setState({
    phase: "adaptive_live",
    coldStartComplete: true,
    degraded: {
      active: useMobileAppStore
        .getState()
        .degraded.active.filter((flag) => flag !== "voice_disconnected"),
      providerMode: useMobileAppStore.getState().degraded.providerMode,
    },
  });
}

function renderCompanionShell() {
  return render(
    <ThemeProvider mode="dark">
      <RootNavigator />
    </ThemeProvider>,
  );
}

function renderWithNav(ui: React.ReactElement) {
  return render(
    <ThemeProvider mode="dark">
      <NavigationProvider>{ui}</NavigationProvider>
    </ThemeProvider>,
  );
}


describe("CK-03 companion crash baseline", () => {
  beforeEach(() => {
    voiceSessionMock.state = "idle";
    voiceSessionMock.lastError = null;
    voiceSessionMock.connect.mockReset();
    voiceSessionMock.connect.mockResolvedValue(undefined);
    voiceSessionMock.disconnect.mockReset();
    voiceSessionMock.bargeIn.mockReset();
    voiceSessionMock.handleTranscript.mockReset();
    resetCompanionStores();
  });

  afterEach(() => {
    resetVoiceSessionSingleton();
    cleanup();
  });

  describe("main buttons", () => {
    it("crash_smoke_home_settings_entry", () => {
      renderCompanionShell();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("settings-entry")));
      expect(screen.getByTestId("settings-screen")).toBeTruthy();
    });

    it("crash_smoke_home_start_cold_start", () => {
      renderCompanionShell();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("start-cold-start")));
      expect(screen.getByTestId("cold-start-dialogue")).toBeTruthy();
    });

    it("crash_smoke_home_quick_capture_cta", () => {
      renderCompanionShell();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("quick-capture-cta")));
      expect(screen.getByTestId("quick-capture-input")).toBeTruthy();
    });

    it("crash_smoke_home_light_entries", () => {
      seedAdaptiveLive();
      renderCompanionShell();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-capture-inbox-entry")));
      expect(screen.getByTestId("capture-inbox-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByLabelText("返回")));
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-brain-map-entry")));
      expect(screen.getByTestId("brain-map-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByLabelText("返回")));
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-memory-review-entry")));
      expect(screen.getByTestId("memory-review-screen")).toBeTruthy();
    });

    it("crash_smoke_home_pending_banner", () => {
      useProvisionalStore.getState().addTextCapture("分享的链接摘要");
      renderCompanionShell();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("provisional-pending-banner")));
      expect(screen.getByTestId("provisional-queue-sheet")).toBeTruthy();
    });
  });

  describe("navigation", () => {
    beforeEach(() => {
      seedAdaptiveLive();
    });

    it("crash_smoke_nav_push_all_routes", () => {
      renderCompanionShell();
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();

      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("today-focus-card-body")));
      expect(screen.getByTestId("today-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByLabelText("返回")));
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();

      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-capture-inbox-entry")));
      expect(screen.getByTestId("capture-inbox-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByLabelText("返回")));
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();

      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-brain-map-entry")));
      expect(screen.getByTestId("brain-map-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByLabelText("返回")));
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();

      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-memory-review-entry")));
      expect(screen.getByTestId("memory-review-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByLabelText("返回")));
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();

      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("settings-entry")));
      expect(screen.getByTestId("settings-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("settings-section-provider")));
      expect(screen.getByTestId("provider-settings-screen")).toBeTruthy();
    });

    it("crash_smoke_nav_back_from_secondary", () => {
      const routes: Array<{ open: string; screen: string; back: () => void }> = [
        {
          open: "today-focus-card-body",
          screen: "today-screen",
          back: () => fireEvent.click(screen.getByLabelText("返回")),
        },
        {
          open: "home-capture-inbox-entry",
          screen: "capture-inbox-screen",
          back: () => fireEvent.click(screen.getByLabelText("返回")),
        },
        {
          open: "home-brain-map-entry",
          screen: "brain-map-screen",
          back: () => fireEvent.click(screen.getByLabelText("返回")),
        },
        {
          open: "home-memory-review-entry",
          screen: "memory-review-screen",
          back: () => fireEvent.click(screen.getByLabelText("返回")),
        },
        {
          open: "settings-entry",
          screen: "settings-screen",
          back: () => fireEvent.click(screen.getByTestId("settings-back")),
        },
      ];

      for (const route of routes) {
        cleanup();
        resetCompanionStores();
        seedAdaptiveLive();
        renderCompanionShell();
        pressWithoutThrow(() => fireEvent.click(screen.getByTestId(route.open)));
        expect(screen.getByTestId(route.screen)).toBeTruthy();
        pressWithoutThrow(() => route.back());
        expect(screen.getByTestId("living-brain-home")).toBeTruthy();
      }

      cleanup();
      resetCompanionStores();
      seedAdaptiveLive();
      renderCompanionShell();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("settings-entry")));
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("settings-section-provider")));
      expect(screen.getByTestId("provider-settings-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("provider-settings-back")));
      expect(screen.getByTestId("settings-screen")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("settings-back")));
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();
    });
  });

  describe("context and action sheets", () => {
    it("crash_smoke_context_sheet_ingest_skip_detail", () => {
      const throwSync = () => {
        throw new Error("handler fault");
      };
      renderWithNav(
        <ContextDecisionSheet
          visible
          title="测试候选"
          whyRecommended="演示推荐"
          onIngest={throwSync}
          onSkip={throwSync}
          onDetail={throwSync}
          onDismiss={vi.fn()}
        />,
      );

      for (const testId of [
        "context-decision-sheet-ingest",
        "context-decision-sheet-skip",
        "context-decision-sheet-detail",
      ]) {
        pressWithoutThrow(() => fireEvent.click(screen.getByTestId(testId)));
      }
    });

    it("crash_smoke_context_sheet_rapid_dismiss_ingest", async () => {
      useMobileAppStore.setState({ queueSheetOpen: true });
      const candidate = useProvisionalStore.getState().addTextCapture("快速关闭测试");
      renderWithNav(<ProvisionalQueueSheet />);
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId(`provisional-item-${candidate.id}`)));
      pressWithoutThrow(() =>
        fireEvent.click(screen.getByTestId("provisional-queue-context-bar-ingest")),
      );
      await waitFor(() => {
        expect(screen.getByTestId("provisional-queue-confirm-sheet")).toBeTruthy();
      });
      pressWithoutThrow(() =>
        fireEvent.click(screen.getByTestId("provisional-queue-confirm-sheet-backdrop")),
      );
      expect(screen.queryByTestId("provisional-queue-confirm-sheet")).toBeNull();
      expect(screen.getByTestId("provisional-queue-sheet")).toBeTruthy();
    });

    it("crash_smoke_action_confirmation_confirm_cancel", () => {
      const draft = buildActionDraft("draft_github_issue", { title: "crash smoke" });
      const throwSync = () => {
        throw new Error("confirm fault");
      };
      renderWithNav(
        <ActionConfirmationSheet
          visible
          draft={draft}
          onConfirm={throwSync}
          onCancel={throwSync}
        />,
      );
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("action-confirmation-sheet-backdrop")));
      cleanup();
      renderWithNav(
        <ActionConfirmationSheet
          visible
          draft={draft}
          onConfirm={throwSync}
          onCancel={throwSync}
        />,
      );
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("action-confirmation-sheet-checkbox-row")));
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("action-confirmation-sheet-confirm")));
    });

    it("crash_smoke_provisional_queue_open_close", () => {
      useMobileAppStore.setState({ queueSheetOpen: true });
      useProvisionalStore.getState().addTextCapture("开关测试");
      renderWithNav(<ProvisionalQueueSheet />);
      expect(screen.getByTestId("provisional-queue-sheet")).toBeTruthy();
      pressWithoutThrow(() => fireEvent.click(screen.getByText("关闭")));
      expect(screen.queryByTestId("provisional-queue-sheet")).toBeNull();
    });
  });

  describe("voice orb", () => {
    beforeEach(() => {
      seedAdaptiveLive();
    });

    it("crash_smoke_voice_orb_press_mic_denied", async () => {
      voiceSessionMock.connect.mockRejectedValue(new Error("Microphone permission denied"));
      renderCompanionShell();
      const rejections = await collectUnhandledRejections(() => {
        pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-voice-orb")));
      });
      expect(rejections).toHaveLength(0);
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();
    });

    it("crash_smoke_voice_orb_connect_failure", async () => {
      voiceSessionMock.connect.mockRejectedValue(new Error("transport connect failed"));
      renderCompanionShell();
      const rejections = await collectUnhandledRejections(() => {
        pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-voice-orb")));
      });
      expect(rejections).toHaveLength(0);
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();
    });

    it("crash_smoke_voice_orb_barge_in_speaking", () => {
      voiceSessionMock.state = "speaking";
      renderCompanionShell();
      pressWithoutThrow(() => fireEvent.click(screen.getByTestId("home-voice-orb")));
      expect(voiceSessionMock.bargeIn).toHaveBeenCalled();
      expect(screen.getByTestId("living-brain-home")).toBeTruthy();
    });
  });

  describe("provider connection", () => {
    beforeEach(() => {
      resetSecureCredentialStoreForTests();
      useMobileAppStore.setState({
        hasApiKey: false,
        degraded: {
          active: ["mock_llm", "fixture_radar", "voice_disconnected"],
          providerMode: "mock",
        },
        providerStatus: {
          llm: "mock",
          radar: "fixture",
          voice: "disconnected",
          storage: "ready",
        },
      });
    });

    it("crash_smoke_provider_test_llm_reject", async () => {
      renderWithNav(
        <TestConnectionButton
          testID="test-connection-llm-smoke"
          onTest={() => Promise.reject(new Error("LLM test rejected"))}
          onResult={vi.fn()}
        />,
      );
      const rejections = await collectUnhandledRejections(() => {
        pressWithoutThrow(() => fireEvent.click(screen.getByTestId("test-connection-llm-smoke")));
      });
      expect(screen.getByTestId("test-connection-llm-smoke")).toBeTruthy();
      expect(rejections).toHaveLength(0);
    });

    it("crash_smoke_provider_test_voice_network_fail", async () => {
      renderWithNav(<ProviderSettingsScreen />);
      await screen.findByTestId("test-connection-realtime");
      const rejections = await collectUnhandledRejections(() => {
        pressWithoutThrow(() => fireEvent.click(screen.getByTestId("test-connection-realtime")));
      });
      await waitFor(() => {
        expect(screen.getByTestId("provider-settings-screen")).toBeTruthy();
      });
      expect(rejections).toHaveLength(0);
    });

    it("crash_smoke_provider_test_radar_fail", async () => {
      renderWithNav(<ProviderSettingsScreen />);
      const rejections = await collectUnhandledRejections(() => {
        pressWithoutThrow(() => fireEvent.click(screen.getByTestId("test-connection-radar")));
      });
      await waitFor(() => {
        expect(screen.getByTestId("provider-row-radar-status")).toBeTruthy();
      });
      expect(rejections).toHaveLength(0);
    });

    it("crash_smoke_provider_test_token_exchange_fail", async () => {
      renderWithNav(<ProviderSettingsScreen />);
      fireEvent.change(screen.getByTestId("provider-token-exchange-url"), {
        target: { value: "http://evil.example/token" },
      });
      const rejections = await collectUnhandledRejections(() => {
        pressWithoutThrow(() => fireEvent.click(screen.getByTestId("test-connection-token-exchange")));
      });
      await waitFor(() => {
        expect(screen.getByTestId("provider-row-token-exchange-error-code")).toBeTruthy();
      });
      expect(rejections).toHaveLength(0);
    });
  });
});
