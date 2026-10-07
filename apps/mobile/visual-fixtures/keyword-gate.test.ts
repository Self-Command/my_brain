import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";


const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const VISUAL_FIXTURE_PREFIX = "mybrain://visual-fixture/";

function parseVisualFixtureCaptureRoute(url: string | null | undefined): string | null {
  if (!url) return null;
  const normalized = url.trim();
  if (!normalized.startsWith(VISUAL_FIXTURE_PREFIX)) return null;
  const route = decodeURIComponent(normalized.slice(VISUAL_FIXTURE_PREFIX.length).split(/[?#]/)[0] ?? "");
  const allowed = new Set(
    JSON.parse(readFileSync(join(root, "apps/mobile/visual-fixtures/manifest.json"), "utf8")).screens.map(
      (entry: { captureRoute: string }) => entry.captureRoute,
    ),
  );
  if (!route || !allowed.has(route)) return null;
  return route;
}

const MOBILE_SOURCE_MAP: Record<string, string[]> = {
  "ui-02-splash": ["apps/mobile/screens/LaunchScreen.tsx"],
  "ui-03-home": ["apps/mobile/screens/LivingBrainHome.tsx"],
  "ui-04-today": ["apps/mobile/screens/TodayScreen.tsx"],
  "ui-05-inbox": ["apps/mobile/screens/CaptureInboxScreen.tsx"],
  "ui-06-map": ["apps/mobile/screens/BrainMapScreen.tsx"],
  "ui-07-memory": ["apps/mobile/screens/MemoryReviewScreen.tsx"],
  "ui-08-settings": ["apps/mobile/screens/SettingsScreen.tsx"],
  "ui-09-context": ["apps/mobile/components/ContextDecisionSheet.tsx"],
  "ui-11-provider": ["apps/mobile/screens/ProviderSettingsScreen.tsx"],
};

const MANIFEST_RUNTIME_TEST_IDS: Record<string, string | null> = {
  "ui-01-icon": null,
  "ui-02-splash": "launch-screen",
  "ui-03-home": "living-brain-home",
  "ui-04-today": "today-screen",
  "ui-05-inbox": "capture-inbox-screen",
  "ui-06-map": "brain-map-screen",
  "ui-07-memory": "memory-review-screen",
  "ui-08-settings": "settings-screen",
  "ui-09-context": "context-decision-sheet",
};

function readSources(paths: string[]): string {
  return paths
    .map((rel) => {
      try {
        return readFileSync(join(root, rel), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}

describe("checked-in visual capture manifest", () => {
  it("defines unique capture routes and valid deep links for all 18 screens", () => {
    const manifest = JSON.parse(readFileSync(join(root, "apps/mobile/visual-fixtures/manifest.json"), "utf8")) as {
      screens: Array<{ screenId: string; captureRoute: string; testID: string | null; deepLink?: string }>;
    };
    expect(manifest.screens).toHaveLength(18);
    expect(new Set(manifest.screens.map((screen) => screen.screenId)).size).toBe(18);
    expect(new Set(manifest.screens.map((screen) => screen.captureRoute)).size).toBe(18);
    for (const screen of manifest.screens.filter((screen) => screen.testID !== null)) {
      expect(parseVisualFixtureCaptureRoute(screen.deepLink)).toBe(screen.captureRoute);
    }
  });
});
describe("companion visual manifest testID contract (CK-08)", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "apps/mobile/visual-fixtures/manifest.json"), "utf8"),
  ) as {
    screens: Array<{ screenId: string; testID: string | null; captureRoute: string }>;
  };

  for (const entry of manifest.screens.filter((s) => s.screenId in MANIFEST_RUNTIME_TEST_IDS)) {
    it(`${entry.screenId} manifest testID matches runtime root testID`, () => {
      const expected = MANIFEST_RUNTIME_TEST_IDS[entry.screenId];
      expect(entry.testID).toBe(expected ?? null);
      if (expected === null) {
        return;
      }
      const sources = MOBILE_SOURCE_MAP[entry.screenId] ?? [];
      const haystack = readSources(sources);
      const hasLiteral = haystack.includes(`testID="${expected}"`);
      const hasDefault = haystack.includes(`testID = "${expected}"`);
      expect(hasLiteral || hasDefault).toBe(true);
    });
  }
});

describe("visual fixture deep link parser (CK-08 capture-only)", () => {
  it("accepts manifest capture routes under mybrain://visual-fixture/", () => {
    expect(parseVisualFixtureCaptureRoute("mybrain://visual-fixture/LivingBrainHome")).toBe(
      "LivingBrainHome",
    );
    expect(parseVisualFixtureCaptureRoute("mybrain://visual-fixture/TodayScreen")).toBe("TodayScreen");
  });

  it("rejects unknown routes and non-fixture URLs", () => {
    expect(parseVisualFixtureCaptureRoute("mybrain://home")).toBeNull();
    expect(parseVisualFixtureCaptureRoute("mybrain://visual-fixture/NotARealScreen")).toBeNull();
    expect(parseVisualFixtureCaptureRoute(null)).toBeNull();
  });
});

import {
  VISUAL_FIXTURE_BASELINE_FRAME,
  computeBaselineCropFromDevice,
  normalizeDeviceScreenshotToBaselineDimensions,
} from "./captureSession";

describe("device screenshot baseline frame (CK-08 adb normalize)", () => {
  it("width-fits 1080x2400 emulator to 390x844 with center crop", () => {
    const crop = computeBaselineCropFromDevice(1080, 2400, VISUAL_FIXTURE_BASELINE_FRAME);
    expect(crop.scaledWidth).toBe(390);
    expect(crop.scaledHeight).toBe(867);
    expect(crop.cropTop).toBe(11);
    const dims = normalizeDeviceScreenshotToBaselineDimensions(1080, 2400);
    expect(dims).toEqual({ width: 390, height: 844 });
  });

  it("leaves 390x844 unchanged", () => {
    const crop = computeBaselineCropFromDevice(390, 844);
    expect(crop.cropTop).toBe(0);
    expect(crop.scaledHeight).toBe(844);
  });
});
