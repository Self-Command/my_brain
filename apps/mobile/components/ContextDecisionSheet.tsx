import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { GlassCard } from "./ui/GlassCard";
import {
  CONTEXT_DECISION_PAGE_COPY,
  labelsForVariant,
  type ContextDecisionLabelVariant,
} from "../theme/contextDecisionLabels";
import {
  brainTheme,
  radius,
  spacing,
  typography,
  type ThemeColors,
  type ThemeMode,
} from "../theme/tokens";
import { isVisualFixtureRoute } from "../visual-fixtures/captureSession";

export interface ContextDecisionSheetProps {
  visible: boolean;
  title: string;
  sourceLabel?: string;
  description?: string;
  whyRecommended: string;
  labelVariant?: ContextDecisionLabelVariant;
  themeMode?: ThemeMode;
  onIngest: () => void;
  onSkip: () => void;
  onDetail: () => void;
  onDismiss: () => void;
  /** CK-08 capture: render inline bottom sheet (no Modal) for adb pixel compare. */
  inlineCapture?: boolean;
  testID?: string;
}

/** Bottom sheet for ingest confirmation — dismiss ≠ ingest (S10). */
export function ContextDecisionSheet({
  visible,
  title,
  sourceLabel,
  description,
  whyRecommended,
  labelVariant = "sheet",
  themeMode = "dark",
  onIngest,
  onSkip,
  onDetail,
  onDismiss,
  inlineCapture = false,
  testID = "context-decision-sheet",
}: ContextDecisionSheetProps) {
  const theme = brainTheme[themeMode];
  const labels = labelsForVariant(labelVariant);
  const captureInline = inlineCapture || isVisualFixtureRoute("ContextDecisionSheet");

  const sheetBody = (
        <View
          style={[
            styles.sheet,
            captureInline && styles.sheetCapture,
            {
              backgroundColor: theme.surface,
              borderColor: captureInline ? "#FFFFFF12" : theme.border,
            },
          ]}
          testID={testID}
        >
          <View style={[styles.handleWrap, captureInline && styles.handleWrapCapture]}>
            <View
              style={[
                styles.handle,
                captureInline && styles.handleCapture,
                { backgroundColor: theme.textTertiary },
              ]}
            />
          </View>

          {sourceLabel ? (
            <Text
              
              style={[{ includeFontPadding: !captureInline },styles.sourceLabel, captureInline && styles.sourceLabelCapture, { color: theme.accent }]}
              testID={`${testID}-source-label`}
            >
              {sourceLabel}
            </Text>
          ) : null}

          <Text
            
            style={[{ includeFontPadding: !captureInline },
              styles.title,
              captureInline && styles.titleCapture,
              { color: theme.text },
            ]}
            testID={`${testID}-title`}
          >
            {title}
          </Text>

          <Text
            
            style={[{ includeFontPadding: !captureInline },
              styles.disclaimer,
              captureInline && styles.disclaimerCapture,
              { color: theme.textSecondary },
            ]}
            testID={`${testID}-disclaimer`}
          >
            {description ?? CONTEXT_DECISION_PAGE_COPY.sheetDisclaimer}
          </Text>

          <GlassCard
            themeMode={themeMode}
            style={[
              styles.evidenceCard,
              captureInline && styles.evidenceCardCapture,
            ]}
            testID={`${testID}-evidence`}
          >
            <Text
              
              style={[{ includeFontPadding: !captureInline },styles.evidenceHeading, captureInline && styles.evidenceHeadingCapture, { color: theme.textSecondary }]}
            >
              {CONTEXT_DECISION_PAGE_COPY.evidenceHeading}
            </Text>
            <Text
              
              style={[{ includeFontPadding: !captureInline },styles.evidenceBody, captureInline && styles.evidenceBodyCapture, { color: theme.textSecondary }]}
            >
              {whyRecommended}
            </Text>
          </GlassCard>

          <SheetAction
            label={labels.ingest}
            variant="primary"
            theme={theme}
            onPress={onIngest}
            testID={`${testID}-ingest`}
            inlineCapture={captureInline}
            style={captureInline ? styles.primaryBtnCapture : undefined}
          />

          <View style={[styles.secondaryRow, captureInline && styles.secondaryRowCapture]}>
            <SheetAction
              label={labels.skip}
              variant="secondary"
              theme={theme}
              onPress={onSkip}
              testID={`${testID}-skip`}
              flex
              inlineCapture={captureInline}
            />
            <SheetAction
              label={labels.detail}
              variant="detail"
              theme={theme}
              onPress={onDetail}
              testID={`${testID}-detail`}
              flex
              inlineCapture={captureInline}
            />
          </View>

          <Text
            
            style={[{ includeFontPadding: !captureInline },
              styles.footer,
              captureInline && styles.footerCapture,
              { color: theme.textTertiary },
            ]}
            testID={`${testID}-voice-footer`}
          >
            {CONTEXT_DECISION_PAGE_COPY.voiceSynonymsFooter}
          </Text>
        </View>
  );

  if (captureInline && visible) {
    return (
      <View style={styles.inlineCaptureRoot} pointerEvents="box-none">
        {sheetBody}
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
      accessibilityViewIsModal
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} testID={`${testID}-backdrop`}>
        {sheetBody}
      </Pressable>
    </Modal>
  );
}

function SheetAction({
  label,
  variant,
  theme,
  onPress,
  testID,
  flex,
  inlineCapture = false,
  style,
}: {
  label: string;
  variant: "primary" | "secondary" | "detail";
  theme: ThemeColors;
  onPress: () => void;
  testID: string;
  flex?: boolean;
  inlineCapture?: boolean;
  style?: object;
}) {
  const isPrimary = variant === "primary";
  const isDetail = variant === "detail";
  return (
    <Pressable
      onPress={() => {
        try {
          onPress();
        } catch {
          // Contain sync handler faults at sheet boundary (CK-03).
        }
      }}
      style={[
        isPrimary ? styles.primaryBtn : styles.secondaryBtn,
        flex ? styles.flexBtn : null,
        inlineCapture && !isPrimary ? styles.secondaryBtnCapture : null,
        isPrimary
          ? inlineCapture
            ? { backgroundColor: "#FF8A7A22", borderColor: "#FF8A7A44" }
            : { backgroundColor: theme.accentMuted, borderColor: `${theme.accent}44` }
          : isDetail
            ? inlineCapture
              ? { backgroundColor: "#7B8CFF22", borderColor: "#7B8CFF44" }
              : { backgroundColor: theme.primaryMuted, borderColor: `${theme.primary}44` }
            : inlineCapture
              ? { backgroundColor: "#FFFFFF0A", borderColor: "#FFFFFF12" }
              : { backgroundColor: "rgba(255,255,255,0.04)", borderColor: theme.border },
        style,
      ]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        
        style={[{ includeFontPadding: !inlineCapture },
          styles.actionText,
          {
            color: isPrimary ? theme.accent : isDetail ? theme.primary : theme.textSecondary,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    minHeight: 420,
  },
  sheetCapture: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: spacing.lg,
    minHeight: 458,
    paddingBottom: spacing.lg,
  },
  inlineCaptureRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  handleWrapCapture: {
    paddingTop: 16,
    paddingBottom: 10,
  },
  titleCapture: {
    fontSize: 24,
    lineHeight: 32,
    marginBottom: 10,
  },
  handleWrap: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  handle: {
    width: 62,
    height: 5,
    borderRadius: 2.5,
    opacity: 0.35,
  },
  handleCapture: {
    opacity: 0.18,
  },
  sourceLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: spacing.xs,
  },
  sourceLabelCapture: {
    marginBottom: 6,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    lineHeight: 30,
    marginBottom: spacing.sm,
  },
  disclaimer: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  disclaimerCapture: {
    lineHeight: 24,
    marginBottom: 10,
  },
  evidenceHeadingCapture: {
    marginBottom: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  evidenceCard: {
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  evidenceCardCapture: {
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 14,
    backgroundColor: "#252932",
    borderColor: "#FFFFFF12",
    borderWidth: 1,
    shadowOpacity: 0,
    elevation: 0,
  },
  evidenceHeading: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  evidenceBody: {
    fontSize: 13,
    lineHeight: 20,
  },
  evidenceBodyCapture: {
    lineHeight: 20,
  },
  primaryBtn: {
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  primaryBtnCapture: {
    alignSelf: "stretch",
    marginBottom: 10,
    minHeight: 48,
    borderRadius: 24,
  },
  secondaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  secondaryRowCapture: {
    gap: 14,
    marginBottom: spacing.sm,
  },
  secondaryBtnCapture: {
    borderRadius: 24,
    minHeight: 48,
  },
  footerCapture: {
    marginTop: 4,
    lineHeight: 14,
  },
  secondaryBtn: {
    borderRadius: radius.full,
    borderWidth: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  flexBtn: {
    flex: 1,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "500",
  },
  footer: {
    ...typography.caption,
    fontSize: 10,
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
