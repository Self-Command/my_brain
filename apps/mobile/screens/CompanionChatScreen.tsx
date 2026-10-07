import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  appendCasualTurn,
  hasExplicitSaveIntent,
  hasRejectMemoryIntent,
  rejectEphemeralMemory,
} from "@my-brain/core";

import { BackButton } from "../navigation/BackButton";
import { PageHeader } from "../components/ui/PageHeader";
import { PrimaryPill } from "../components/ui/PrimaryPill";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { useProvisionalStore } from "../stores/provisionalStore";
import { useTheme } from "../theme/ThemeProvider";
import { brainTheme, safeArea, spacing } from "../theme/tokens";
import { completeConfiguredChat, mobileChatMessages } from "../services/configuredLlm";
import { subscribeProviderProfiles } from "../services/providerProfiles";

interface Props {
  testID?: string;
  onClose?: () => void;
}

export function CompanionChatScreen({
  testID = "screen-companion-chat",
  onClose,
}: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeProviderProfiles(() => { activeRequest.current?.abort(); setBusy(false); });
    return () => { activeRequest.current?.abort(); unsubscribe(); };
  }, []);
  const ephemeralChat = useMobileAppStore((s) => s.ephemeralChat);
  const startEphemeralChat = useMobileAppStore((s) => s.startEphemeralChat);
  const setEphemeralChat = useMobileAppStore((s) => s.setEphemeralChat);
  const closeCompanionChat = useMobileAppStore((s) => s.closeCompanionChat);
  const addChatSaveCandidate = useProvisionalStore((s) => s.addChatSaveCandidate);
  const graphNodeCount = useMobileAppStore((s) => s.graph.countVisibleNodes());
  const { mode: themeMode, colors } = useTheme();
  const theme = brainTheme[themeMode];

  const chat = ephemeralChat;

  useEffect(() => {
    if (!ephemeralChat) {
      startEphemeralChat();
    }
  }, [ephemeralChat, startEphemeralChat]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: safeArea.screenTopChrome,
        },
        scroll: { flex: 1 },
        scrollContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm },
        bubbleCard: {
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
        },
        userWrap: { alignItems: "flex-end" },
        userCard: { maxWidth: "86%", backgroundColor: colors.surfaceMuted },
        bubbleText: { color: theme.textSecondary, fontSize: 14, lineHeight: 22 },
        userBubbleText: { color: colors.text },
        contextCard: { backgroundColor: colors.surfaceMuted },
        accentLabel: { color: colors.accent, fontSize: 12, fontWeight: "600", marginBottom: 4 },
        cardTitle: { color: colors.text, fontSize: 16, fontWeight: "500", marginBottom: 4 },
        caption: { color: theme.textSecondary, fontSize: 13, lineHeight: 18 },
        actions: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: spacing.xs,
          marginTop: spacing.md,
        },
        footer: {
          paddingHorizontal: spacing.md,
          paddingBottom: spacing.md,
          gap: spacing.sm,
        },
        input: {
          backgroundColor: colors.surfaceMuted,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          color: colors.text,
        },
        graphGuard: {
          color: theme.textSecondary,
          fontSize: 12,
          textAlign: "center",
        },
      }),
    [colors, theme],
  );

  if (!chat) return null;

  const send = (text: string) => {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (hasRejectMemoryIntent(trimmed)) {
      const withUser = {
        ...chat,
        turns: [...chat.turns, { role: "user" as const, text: trimmed, atMs: Date.now() }],
        totalUserTurns: chat.totalUserTurns + 1,
      };
      setEphemeralChat(rejectEphemeralMemory(withUser));
      setInput("");
      return;
    }
    if (hasExplicitSaveIntent(trimmed)) {
      const candidate = addChatSaveCandidate(chat, trimmed);
      setEphemeralChat({
        ...chat,
        turns: [
          ...chat.turns,
          { role: "user", text: trimmed, atMs: Date.now() },
          {
            role: "assistant",
            text: `已生成资产候选「${candidate.summary.slice(0, 32)}」——仍需你确认才会入库。`,
            atMs: Date.now(),
          },
        ],
        totalUserTurns: chat.totalUserTurns + 1,
      });
      setInput("");
      return;
    }
    if (!useMobileAppStore.getState().providerLlmLive) {
      const { state } = appendCasualTurn(chat, trimmed);
      setEphemeralChat(state);
      setRequestError("当前为明确的演示对话；真实回复需先验证语言模型。");
      setInput(""); return;
    }
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const withUser = { ...chat, turns: [...chat.turns, { role: "user" as const, text: trimmed, atMs: Date.now() }], totalUserTurns: chat.totalUserTurns + 1 };
    setEphemeralChat(withUser); setBusy(true); setRequestError("");
    void completeConfiguredChat(mobileChatMessages(chat, trimmed), controller.signal).then((reply) => {
      const current = useMobileAppStore.getState().ephemeralChat;
      if (controller.signal.aborted || current?.sessionId !== chat.sessionId) return;
      const next = appendCasualTurn(chat, trimmed).state;
      next.turns[next.turns.length - 1] = { role: "assistant", text: reply, atMs: Date.now() };
      setEphemeralChat(next);
    }).catch(() => { if (!controller.signal.aborted) setRequestError("语言模型回复失败，请检查连接后重试。"); })
      .finally(() => { if (activeRequest.current === controller) setBusy(false); });
    setInput("");
  };

  const onRejectMemory = () => {
    activeRequest.current?.abort(); setBusy(false);
    setEphemeralChat(rejectEphemeralMemory(chat));
  };

  const onSaveFromPill = () => {
    activeRequest.current?.abort(); setBusy(false);
    const lastUser = [...chat.turns].reverse().find((t) => t.role === "user");
    const text = lastUser?.text ?? (input.trim() || "陪聊片段");
    const candidate = addChatSaveCandidate(chat, `记下来：${text}`);
    setEphemeralChat({
      ...chat,
      turns: [
        ...chat.turns,
        {
          role: "assistant",
          text: `已生成资产候选「${candidate.summary.slice(0, 32)}」——确认前不会写入永久星图。`,
          atMs: Date.now(),
        },
      ],
    });
  };

  const handleClose = () => {
    activeRequest.current?.abort();
    closeCompanionChat();
    onClose?.();
  };

  return (
    <View style={styles.root} testID={testID}>
      <PageHeader
        variant="contract"
        title="陪你聊会儿"
        subtitle="闲聊默认不入库；你说记下来才生成候选。"
        leftSlot={<BackButton onPress={handleClose} testID="companion-chat-back" />}
        testID="companion-chat-header"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        testID="companion-chat-scroll"
      >
        {chat.turns.map((turn, index) =>
          turn.role === "user" ? (
            <View key={`${turn.atMs}-${index}`} style={styles.userWrap}>
              <View style={[styles.bubbleCard, styles.userCard]}>
                <Text style={[styles.bubbleText, styles.userBubbleText]}>{turn.text}</Text>
              </View>
            </View>
          ) : (
            <View key={`${turn.atMs}-${index}`} style={styles.bubbleCard}>
              <Text style={styles.bubbleText}>{turn.text}</Text>
            </View>
          ),
        )}
        <View style={[styles.bubbleCard, styles.contextCard]} testID="companion-chat-context-card">
          <Text style={styles.accentLabel}>短期上下文</Text>
          <Text style={styles.cardTitle}>本轮只是陪聊，不写入永久图谱</Text>
          <Text style={styles.caption}>
            {chat.contextSummary ?? "如果你说「这个记下来」，才会出现资产候选。"}
          </Text>
        </View>
        <View style={styles.actions}>
          <PrimaryPill
            label="继续聊"
            onPress={() => send(input)}
            themeMode={themeMode}
            testID="companion-chat-continue"
          />
          <PrimaryPill
            label="记下来"
            onPress={onSaveFromPill}
            themeMode={themeMode}
            testID="companion-chat-save-hint"
          />
          <PrimaryPill
            label="别记录"
            onPress={onRejectMemory}
            themeMode={themeMode}
            testID="companion-chat-reject-memory"
          />
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <TextInput
          placeholder="随便说，我会先陪你把话说完…"
          placeholderTextColor={theme.textSecondary}
          style={styles.input}
          value={input}
          onChangeText={setInput}
          testID="companion-chat-input"
        />
        <Pressable disabled={busy} onPress={() => send(input)} testID="companion-chat-send">
          <Text style={{ color: colors.primary }}>{busy ? "回复中…" : "发送"}</Text>
        </Pressable>
        {busy ? <Pressable onPress={() => { activeRequest.current?.abort(); setBusy(false); }}><Text style={{ color: colors.primary }}>停止回复</Text></Pressable> : null}
        {requestError ? <Text style={styles.caption}>{requestError}</Text> : null}
        <Text style={styles.graphGuard} testID="companion-chat-graph-guard">
          永久节点 {graphNodeCount} · 陪聊不自动入库
        </Text>
      </View>
    </View>
  );
}
