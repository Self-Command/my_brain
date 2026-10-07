import type { GraphRepository } from "../graph/types.js";

/** Short-term companion chat context — default discard after session. */
export const EPHEMERAL_SESSION_MAX_MS = 10 * 60 * 1000;

/** Rolling in-memory context cap; older turns drop from active context. */
export const EPHEMERAL_CONTEXT_MAX_TURNS = 12;

export interface EphemeralChatTurn {
  role: "user" | "assistant";
  text: string;
  atMs: number;
}

export interface EphemeralConversationState {
  sessionId: string;
  startedAtMs: number;
  turns: EphemeralChatTurn[];
  totalUserTurns: number;
  memoryRejected: boolean;
  contextSummary: string | null;
}

export function createEphemeralConversation(nowMs = Date.now()): EphemeralConversationState {
  return {
    sessionId: `ephemeral-${nowMs}`,
    startedAtMs: nowMs,
    turns: [
      {
        role: "assistant",
        text: "今天不聊知识也行，我在。",
        atMs: nowMs,
      },
    ],
    memoryRejected: false,
    totalUserTurns: 0,
    contextSummary: null,
  };
}

export function isEphemeralSessionActive(
  state: EphemeralConversationState,
  nowMs = Date.now(),
): boolean {
  return nowMs - state.startedAtMs <= EPHEMERAL_SESSION_MAX_MS;
}

export function trimEphemeralContext(
  state: EphemeralConversationState,
): EphemeralConversationState {
  if (state.turns.length <= EPHEMERAL_CONTEXT_MAX_TURNS) {
    return state;
  }
  const trimmed = state.turns.slice(-EPHEMERAL_CONTEXT_MAX_TURNS);
  const userSnippets = trimmed
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.text)
    .slice(-3);
  return {
    ...state,
    turns: trimmed,
    contextSummary:
      userSnippets.length > 0 ? `近期陪聊：${userSnippets.join("；")}` : state.contextSummary,
  };
}

function buildCasualAssistantReply(userText: string, memoryRejected: boolean): string {
  if (/焦虑|压力|慢|累|烦/i.test(userText)) {
    return memoryRejected
      ? "我听到了。我们可以先把压力拆小一点，也可以只聊聊——这轮不会写入永久图谱。"
      : "我听到了。我们可以先把压力拆小一点，也可以只聊聊，不记录任何东西。";
  }
  if (/项目|学习|工作/i.test(userText)) {
    return "嗯，我在。陪聊默认不入库；只有你说「记下来」才会进入候选流程。";
  }
  return "好，继续聊。短期上下文只留在本轮，不会自动写入星图。";
}

export interface AppendCasualTurnResult {
  state: EphemeralConversationState;
  assistantReply: string;
}

/** Append a casual user turn — never mutates graph or permanent stores. */
export function appendCasualTurn(
  state: EphemeralConversationState,
  userText: string,
  nowMs = Date.now(),
): AppendCasualTurnResult {
  const trimmed = userText.trim();
  if (!trimmed) {
    return { state, assistantReply: "" };
  }

  const assistantReply = buildCasualAssistantReply(trimmed, state.memoryRejected);
  const withTurns: EphemeralConversationState = {
    ...state,
    totalUserTurns: state.totalUserTurns + 1,
    turns: [
      ...state.turns,
      { role: "user", text: trimmed, atMs: nowMs },
      { role: "assistant", text: assistantReply, atMs: nowMs },
    ],
  };
  return { state: trimEphemeralContext(withTurns), assistantReply };
}

export function rejectEphemeralMemory(
  state: EphemeralConversationState,
  nowMs = Date.now(),
): EphemeralConversationState {
  const reply = "好的，这轮陪聊不会写入画像或永久图谱。";
  return trimEphemeralContext({
    ...state,
    memoryRejected: true,
    turns: [...state.turns, { role: "assistant", text: reply, atMs: nowMs }],
  });
}

/** Simulate an extended casual session for persistence boundary tests. */
export function simulateExtendedCasualSession(
  userUtterances: string[],
  startMs = Date.now(),
  intervalMs = 60_000,
): EphemeralConversationState {
  let state = createEphemeralConversation(startMs);
  userUtterances.forEach((utterance, index) => {
    const at = startMs + index * intervalMs;
    ({ state } = appendCasualTurn(state, utterance, at));
  });
  return state;
}

/** Guard: casual companion chat must not create permanent graph nodes. */
export function assertCasualChatGraphBoundary(
  beforeVisibleNodes: number,
  afterVisibleNodes: number,
): void {
  if (afterVisibleNodes !== beforeVisibleNodes) {
    throw new Error("casual chat must not create permanent graph nodes");
  }
}

/** Run casual chat simulation while observing graph — returns unchanged node count. */
export function runCasualChatGraphBoundaryCheck(
  graph: GraphRepository,
  utterances: string[],
  startMs = Date.now(),
): { finalState: EphemeralConversationState; nodeCount: number } {
  const before = graph.countVisibleNodes();
  const finalState = simulateExtendedCasualSession(utterances, startMs);
  const after = graph.countVisibleNodes();
  assertCasualChatGraphBoundary(before, after);
  return { finalState, nodeCount: after };
}
