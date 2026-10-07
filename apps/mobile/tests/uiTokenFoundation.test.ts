import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  brainTheme,
  fontFamily,
  fontWeight,
  opacity,
  radius,
  shadows,
  spacing,
  textOnPrimary,
  typography,
  warmInkColorContract,
  warmInkUiSource,
} from "../theme/tokens";

const root = join(__dirname, "..", "..", "..");

const primitiveFiles = [
  "GlassCard.tsx",
  "PageHeader.tsx",
  "SectionHeader.tsx",
  "SettingRow.tsx",
  "PrimaryPill.tsx",
  "ContextDecisionBar.tsx",
  "VoiceOrb.tsx",
  "ConstellationStar.tsx",
] as const;

describe("ui token foundation (CK-07)", () => {
  it("documents Warm Ink UI source paths", () => {
    expect(warmInkUiSource.contractDir).toBe("app-development/UI");
    expect(warmInkUiSource.designSystem).toContain("DESIGN_SYSTEM.md");
  });

  it("maps dark Warm Ink palette to SVG contract colors", () => {
    for (const key of Object.keys(warmInkColorContract.dark) as Array<
      keyof typeof warmInkColorContract.dark
    >) {
      expect(brainTheme.dark[key]).toBe(warmInkColorContract.dark[key]);
    }
  });

  it("maps light Warm Ink palette to SVG contract colors", () => {
    for (const key of Object.keys(warmInkColorContract.light) as Array<
      keyof typeof warmInkColorContract.light
    >) {
      expect(brainTheme.light[key]).toBe(warmInkColorContract.light[key]);
    }
  });

  it("keeps readable text contrast against both checked-in theme backgrounds", () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    for (const theme of [brainTheme.dark, brainTheme.light]) {
      const foreground = luminance(theme.text);
      const background = luminance(theme.background);
      expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("defines 8pt spacing grid from DESIGN_SYSTEM §4", () => {
    expect(spacing).toEqual({ xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 });
  });

  it("defines radius scale including pill full radius", () => {
    expect(radius.sm).toBe(12);
    expect(radius.md).toBe(16);
    expect(radius.lg).toBe(24);
    expect(radius.full).toBe(9999);
  });

  it("defines typography ladder with font families and weights", () => {
    expect(typography.hero).toMatchObject({
      fontSize: 28,
      lineHeight: 36,
      fontWeight: fontWeight.semibold,
      fontFamily: fontFamily.display,
    });
    expect(typography.body.fontFamily).toBe(fontFamily.body);
    expect(typography.caption.fontSize).toBe(13);
    expect(typography.micro.fontSize).toBe(11);
  });

  it("defines interaction opacity and on-primary text tokens", () => {
    expect(opacity.disabled).toBe(0.5);
    expect(opacity.pressed).toBe(0.88);
    expect(textOnPrimary).toBe("#FFFFFF");
  });

  it("aligns card shadow borders with theme border tokens", () => {
    expect(shadows.darkCard.borderColor).toBe(brainTheme.dark.border);
    expect(shadows.lightCard.borderColor).toBe(brainTheme.light.border);
  });

  it("requires UI primitives to import theme tokens", () => {
    for (const file of primitiveFiles) {
      const source = readFileSync(
        join(root, "apps", "mobile", "components", "ui", file),
        "utf8",
      );
      expect(source, file).toMatch(/from ["'].*theme\/tokens["']/);
    }
  });

  it("does not hardcode divergent hex colors in UI primitives", () => {
    for (const file of primitiveFiles) {
      const source = readFileSync(
        join(root, "apps", "mobile", "components", "ui", file),
        "utf8",
      );
      const hexMatches = source.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
      expect(hexMatches, file).toEqual([]);
    }
  });
});
