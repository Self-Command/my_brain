import { useCallback, useEffect, useRef } from "react";

import type { LlmProvider, UserIntent } from "@my-brain/core";
import {
  applyExplainMoreToState,
  applyUserIntent,
  confirmUserIngest,
  createMockLlmProvider,
  enterProvisionalPending,
  resolveExplainMore,
  resolveExplainTopicFromConversation,
  selectAdaptiveSignal,
  undoLastGraphChangeInMemory,
} from "@my-brain/core";

import { loadProviderSettings } from "../services/providerConfigStore";
import { resolveConfiguredLlm } from "../services/configuredLlm";
import { subscribeProviderProfiles } from "../services/providerProfiles";
import { useMobileAppStore } from "../stores/mobileAppStore";
import { useProvisionalStore } from "../stores/provisionalStore";

async function resolveConversationLlm(hasApiKey: boolean, signal?: AbortSignal): Promise<LlmProvider> {
  if (!hasApiKey) {
    return createMockLlmProvider();
  }

  const settings = loadProviderSettings();
  if (settings.llm.providerId === "mock") {
    return createMockLlmProvider();
  }

  return resolveConfiguredLlm(signal);
}

export function useConversationSession() {
  const pendingExplanation = useRef<Promise<string> | null>(null);
  const pendingAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeProviderProfiles(() => { pendingAbort.current?.abort(); pendingExplanation.current = null; });
    return () => { pendingAbort.current?.abort(); unsubscribe(); };
  }, []);
  const conversation = useMobileAppStore((s) => s.conversation);
  const setConversation = useMobileAppStore((s) => s.setConversation);
  const graph = useMobileAppStore((s) => s.graph);
  const history = useMobileAppStore((s) => s.history);
  const syncGraphView = useMobileAppStore((s) => s.syncGraphView);
  const flushPersist = useMobileAppStore((s) => s.flushPersist);
  const setLastIngestSummary = useMobileAppStore((s) => s.setLastIngestSummary);
  const setPendingIngestProposal = useMobileAppStore((s) => s.setPendingIngestProposal);
  const signals = useMobileAppStore((s) => s.signals);
  const hasApiKey = useMobileAppStore((s) => s.hasApiKey);
  const provisionalCandidates = useProvisionalStore((s) => s.candidates);
  const confirmProvisional = useProvisionalStore((s) => s.confirm);
  const rejectProvisional = useProvisionalStore((s) => s.reject);
  const explainProvisional = useProvisionalStore((s) => s.explain);

  const focusSignal = useCallback(
    (signalIndex: number) => {
      const sig = signals[signalIndex];
      if (!sig) {
        return;
      }
      const signalId = sig.evidenceRefs[0] ?? `signal-${signalIndex}`;
      setConversation(selectAdaptiveSignal(conversation, signalId));
    },
    [conversation, setConversation, signals],
  );

  const focusProvisional = useCallback(
    (provisionalId: string) => {
      setConversation(enterProvisionalPending(conversation, provisionalId));
    },
    [conversation, setConversation],
  );

  const dispatchIntent = useCallback(
    (intent: UserIntent) => {
      pendingAbort.current?.abort();
      const provisionalIdBefore = conversation.activeProvisionalId;

      if (intent === "explain_more") {
        const { topic, context } = resolveExplainTopicFromConversation({
          activeSignalId: conversation.activeSignalId,
          activeProvisionalId: conversation.activeProvisionalId,
          signalTitles: signals.map((signal, index) => {
            const title = signal.evidenceRefs[0] ?? `signal-${index}`;
            return {
              id: title,
              title,
              summary: signal.evidenceRefs.join(" · ") || title,
            };
          }),
          provisionalSummaries: provisionalCandidates.map((candidate) => ({
            id: candidate.id,
            summary: candidate.summary,
          })),
        });

        const { state: interim, assistantReply } = applyUserIntent(conversation, intent, {
          explainTopic: topic,
          explainContext: context,
        });
        setConversation(interim);

        const settingsAtStart = JSON.stringify(loadProviderSettings().llm);
        const controller = new AbortController(); pendingAbort.current = controller;
        pendingExplanation.current = (async () => {
          let text = assistantReply;
          try {
            const llm = await resolveConversationLlm(hasApiKey, controller.signal);
            const resolved = await resolveExplainMore({ topic, context, llm });
            if (resolved.source === "llm") text = resolved.text;
            else if (hasApiKey) text = "语言模型解释失败，请检查连接后重试。";
          } catch { text = "语言模型调用失败，请检查配置后重试。"; }
          const current = useMobileAppStore.getState().conversation;
          if (controller.signal.aborted || current.phase !== "explaining" || current.activeSignalId !== interim.activeSignalId || current.activeProvisionalId !== interim.activeProvisionalId || JSON.stringify(loadProviderSettings().llm) !== settingsAtStart) return "";
          const { state: upgraded } = applyExplainMoreToState(current, text);
          setConversation(upgraded);
          return text;
        })();

        if (provisionalIdBefore) {
          explainProvisional(provisionalIdBefore);
        }

        return assistantReply;
      }

      const { state: next, assistantReply } = applyUserIntent(conversation, intent);
      setConversation(next);

      if (intent === "ingest") {
        if (provisionalIdBefore) {
          const result = confirmProvisional(provisionalIdBefore);
          if (result) {
            setLastIngestSummary(result.autoCurateSummary);
            syncGraphView();
          }
          return assistantReply;
        }
        if (next.activeSignalId) {
          const idx = signals.findIndex((s) => s.evidenceRefs[0] === next.activeSignalId);
          const signal = signals[idx] ?? signals[0];
          if (signal) {
            const title = signal.evidenceRefs[0] ?? "新概念";
            setPendingIngestProposal({
              id: `signal-proposal-${title}`,
              concept: title.slice(0, 32),
              intro: `来自今日入口：${title}`,
              sourceLinks: signal.evidenceRefs,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      if (intent === "skip" && provisionalIdBefore) {
        rejectProvisional(provisionalIdBefore);
      }

      return assistantReply;
    },
    [
      conversation,
      setConversation,
      confirmProvisional,
      rejectProvisional,
      explainProvisional,
      signals,
      provisionalCandidates,
      graph,
      history,
      syncGraphView,
      setLastIngestSummary,
      setPendingIngestProposal,
      hasApiKey,
    ],
  );

  const confirmPendingIngest = useCallback(() => {
    const app = useMobileAppStore.getState();
    const proposal = app.pendingIngestProposal;
    const provisionalId = app.conversation.activeProvisionalId;

    if (provisionalId) {
      const result = confirmProvisional(provisionalId);
      if (result) {
        setLastIngestSummary(result.autoCurateSummary);
        syncGraphView();
      }
      useMobileAppStore.getState().setPendingIngestProposal(null);
      return;
    }

    if (proposal) {
      confirmUserIngest(
        {
          concept: proposal.concept,
          intro: proposal.intro,
          sourceLinks: proposal.sourceLinks,
        },
        { graph, history },
      );
      syncGraphView();
      setLastIngestSummary("星核已点亮");
      flushPersist();
      useMobileAppStore.getState().setPendingIngestProposal(null);
    }
  }, [
    confirmProvisional,
    graph,
    history,
    syncGraphView,
    setLastIngestSummary,
    flushPersist,
  ]);

  const undoLastChange = useCallback(() => {
    const summary = undoLastGraphChangeInMemory(graph, history);
    syncGraphView();
    return summary;
  }, [graph, history, syncGraphView]);

  return {
    conversation,
    focusSignal,
    focusProvisional,
    dispatchIntent,
    dispatchVoiceIntent: async (intent: UserIntent, signal?: AbortSignal) => {
      const immediate = dispatchIntent(intent);
      if (intent !== "explain_more") return immediate;
      const abort = () => pendingAbort.current?.abort();
      signal?.addEventListener("abort", abort, { once: true });
      try { return await pendingExplanation.current; }
      finally { signal?.removeEventListener("abort", abort); }
    },
    confirmPendingIngest,
    undoLastChange,
  };
}
