/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

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

const meta = vi.hoisted(() => new Map<string, string>());
vi.mock("../storage/storageSession", () => ({
  getStorageSession: vi.fn(() => ({
    storage: {
      getMeta: vi.fn((key: string) => meta.get(key) ?? null),
      setMeta: vi.fn((key: string, value: string) => { meta.set(key, value); }),
      appendDiagnosticEvent: vi.fn(),
      deleteMeta: vi.fn((key: string) => { meta.delete(key); }),
      saveGraphSnapshot: vi.fn(), saveHistoryEntry: vi.fn(), saveUserModeProfile: vi.fn(),
      saveCorrectionState: vi.fn(), saveProvisionalCandidates: vi.fn(), saveAdaptiveSignals: vi.fn(),
      saveLearningTraces: vi.fn(), savePendingIngestProposal: vi.fn(), saveProviderConfig: vi.fn(),
    },
  })),
}));

vi.mock("react-native", () => {
  const RN = (tag: string) =>
    function MockComponent({
      children,
      testID,
      accessibilityRole,
      accessibilityLabel,
      accessibilityState,
      onPress,
      disabled,
      onChangeText,
      value,
      onBlur,
      onValueChange,
    }: {
      children?: React.ReactNode;
      testID?: string;
      accessibilityRole?: string;
      accessibilityLabel?: string;
      accessibilityState?: { busy?: boolean };
      onPress?: () => void;
      disabled?: boolean;
      onChangeText?: (v: string) => void;
      value?: string;
      onBlur?: () => void;
      onValueChange?: (v: boolean) => void;
    }) {
      if (tag === "input") {
        return React.createElement("input", {
          "data-testid": testID,
          value,
          onChange: (e: { target: { value: string } }) => onChangeText?.(e.target.value),
          onBlur,
        });
      }
      if (tag === "switch") {
        return React.createElement("input", {
          type: "checkbox",
          "data-testid": testID,
          checked: value === true || value === "true",
          onChange: (e: { target: { checked: boolean } }) => onValueChange?.(e.target.checked),
        });
      }
      return React.createElement(
        onPress ? "button" : tag,
        {
          "data-testid": testID,
          role: accessibilityRole,
          "aria-label": accessibilityLabel,
          "aria-busy": accessibilityState?.busy,
          onClick: disabled ? undefined : onPress,
        },
        children,
      );
    };
  return {
    View: RN("div"),
    Text: RN("span"),
    TextInput: RN("input"),
    Pressable: RN("button"),
    ScrollView: RN("div"),
    Switch: RN("switch"),
    ActivityIndicator: RN("span"),
    StyleSheet: { create: (s: object) => s },
    Platform: { OS: "android", Version: "14", select: (o: Record<string, string>) => o.android },
  };
});

import { ProviderSettingsScreen } from "./ProviderSettingsScreen";
import { NavigationProvider } from "../navigation/NavigationContext";
import { ThemeProvider } from "../theme/ThemeProvider";
import {
  resetSecureCredentialStoreForTests,
} from "../services/secureCredentialStore";
import { useMobileAppStore } from "../stores/mobileAppStore";

vi.mock("../services/secureCredentialStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/secureCredentialStore")>();
  const memory = actual.createMemorySecureCredentialStore();
  return {
    ...actual,
    getSecureCredentialStore: () => memory,
    resetSecureCredentialStoreForTests: actual.resetSecureCredentialStoreForTests,
  };
});

async function renderProviderSettings() {
  const view = render(
    <ThemeProvider mode="dark">
      <NavigationProvider>
        <ProviderSettingsScreen />
      </NavigationProvider>
    </ThemeProvider>,
  );
  await screen.findByTestId("universal-provider-settings");
  return view;
}

describe("ProviderSettingsScreen (S14)", () => {
  beforeEach(() => {
    meta.clear();
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

  afterEach(() => cleanup());

  it("renders provider settings with all connection blocks", async () => {
    await renderProviderSettings();
    expect(screen.getByTestId("provider-settings-screen")).toBeTruthy();
    expect(screen.getByTestId("provider-editor-llm")).toBeTruthy();
    expect(screen.getByTestId("provider-editor-realtime")).toBeTruthy();
    expect(screen.getByTestId("provider-row-radar")).toBeTruthy();
    expect(screen.getByTestId("provider-row-token-exchange")).toBeTruthy();
    expect(screen.getByTestId("provider-row-execution-api")).toBeTruthy();
  });

  it("rejects an unconfigured LLM without silently granting mock readiness", async () => {
    await renderProviderSettings();
    fireEvent.click(screen.getByTestId("test-connection-llm"));
    await screen.findByText(/保存失败|Invalid URL|公网 HTTPS/);
    expect(useMobileAppStore.getState().providerLlmLive).toBe(false);
  });
  it("shows error code on token exchange http URL — not connected", async () => {
    await renderProviderSettings();
    fireEvent.change(screen.getByTestId("provider-token-exchange-url"), {
      target: { value: "http://evil.example/token" },
    });
    fireEvent.click(screen.getByTestId("test-connection-token-exchange"));
    await waitFor(() => {
      expect(screen.getByTestId("provider-row-token-exchange-error-code")).toBeTruthy();
      expect(screen.getByTestId("provider-row-token-exchange-status").textContent).toContain(
        "连接失败",
      );
    });
  });

  it("masks API key as last4 only after save", async () => {
    await renderProviderSettings();
    fireEvent.change(screen.getByTestId("provider-llm-endpoint"), { target: { value: "https://example.com/v1" } });
    fireEvent.change(screen.getByTestId("provider-llm-model"), { target: { value: "manual-model" } });
    fireEvent.change(screen.getByTestId("provider-llm-key-input"), {
      target: { value: "sk-test-key-ab12" },
    });
    fireEvent.click(screen.getByTestId("provider-llm-save"));
    await waitFor(() => {
      expect(screen.getByTestId("provider-llm-key-mask").textContent).toContain("••••ab12");
      expect(screen.getByTestId("provider-llm-key-mask").textContent).not.toContain("sk-test");
    });
  });

  it("does not mark LLM live immediately after saving an untested key", async () => {
    await renderProviderSettings();
    fireEvent.change(screen.getByTestId("provider-llm-endpoint"), { target: { value: "https://example.com/v1" } });
    fireEvent.change(screen.getByTestId("provider-llm-model"), { target: { value: "manual-model" } });
    fireEvent.change(screen.getByTestId("provider-llm-key-input"), {
      target: { value: "sk-untested-key-ab12" },
    });
    fireEvent.click(screen.getByTestId("provider-llm-save"));
    await waitFor(() => {
      expect(useMobileAppStore.getState().providerStatus.llm).toBe("degraded");
      expect(useMobileAppStore.getState().providerStatus.llm).not.toBe("live");
    });
  });

  it("masks voice key as last4 only after save", async () => {
    await renderProviderSettings();
    fireEvent.change(screen.getByTestId("provider-realtime-key-input"), {
      target: { value: "voice-secret-5678" },
    });
    fireEvent.click(screen.getByTestId("provider-realtime-save"));
    await waitFor(() => {
      expect(screen.getByTestId("provider-realtime-key-mask").textContent).toContain("••••5678");
      expect(screen.getByTestId("provider-realtime-key-mask").textContent).not.toContain("voice-secret");
    });
  });

  it("shows BYOK note for token exchange section", async () => {
    await renderProviderSettings();
    expect(screen.getByTestId("provider-token-exchange-byok-note")).toBeTruthy();
    expect(screen.getByTestId("provider-token-exchange-byok-note").textContent).toMatch(
      /BYOK/,
    );
  });

  it("execution API enabled switch defaults off", async () => {
    await renderProviderSettings();
    const toggle = screen.getByTestId("provider-execution-api-enabled") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it("launch gate mode shows gate banner and separate role verification controls", async () => {
    render(
      <ThemeProvider mode="dark">
        <ProviderSettingsScreen launchGate />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("provider-launch-gate-banner")).toBeTruthy();
    expect(await screen.findByTestId("test-connection-llm")).toBeTruthy();
    expect(screen.queryByTestId("provider-settings-back")).toBeNull();
  });
});
