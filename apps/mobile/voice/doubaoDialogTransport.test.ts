import { afterEach, describe, expect, it, vi } from "vitest";
import { VOLC_SERVER_EVENT, type DoubaoWebSocketLike } from "@my-brain/core";
import { createDoubaoDialogVoiceTransport } from "./doubaoDialogTransport";
import { startDoubaoMicCapture } from "./doubaoPcmAudio";
vi.mock("./doubaoPcmAudio", () => ({ connectDoubaoPlaybackPipeline: vi.fn(async () => undefined), startDoubaoMicCapture: vi.fn(async () => ({ stop: vi.fn(async () => undefined) })), teardownDoubaoAudio: vi.fn(async () => undefined), muteDoubaoMic: vi.fn(), pushDoubaoTtsChunk: vi.fn(), invalidateDoubaoPlaybackTurn: vi.fn(async () => undefined) }));
function serverFrame(eventId: number, payload: unknown): ArrayBuffer {
  const body = new TextEncoder().encode(JSON.stringify(payload)); const frame = new Uint8Array(16 + body.length);
  frame.set([0x11, 0x94, 0x10, 0]); const view = new DataView(frame.buffer);
  view.setUint32(4, eventId); view.setUint32(8, 0); view.setUint32(12, body.length); frame.set(body, 16); return frame.buffer;
}
const sockets: MockSocket[] = [];
class MockSocket implements DoubaoWebSocketLike {
  readyState = 1; binaryType = "arraybuffer"; onopen: DoubaoWebSocketLike["onopen"] = null;
  onmessage: DoubaoWebSocketLike["onmessage"] = null; onerror: DoubaoWebSocketLike["onerror"] = null; onclose: DoubaoWebSocketLike["onclose"] = null;
  send = vi.fn(); close = vi.fn(); constructor() { sockets.push(this); }
}
afterEach(() => { sockets.length = 0; vi.clearAllMocks(); });
describe("retained Doubao transport boundary", () => {
  it("emits confirmed final ASR only, preserving the original realtime reply transport", async () => {
    const transport = createDoubaoDialogVoiceTransport({ appId: "fixture-app", accessToken: "fixture-token" }, { DoubaoWebSocket: MockSocket });
    const transcript = vi.fn(); transport.onTranscript(transcript);
    const connected = transport.connect({ url: "wss://doubao-volc", protocols: [], providerId: "doubao-volc", model: "2.2.0.0" });
    const socket = sockets[0]!;
    socket.onmessage?.({ data: serverFrame(VOLC_SERVER_EVENT.sessionStarted, {}) }); await connected;
    socket.onmessage?.({ data: serverFrame(VOLC_SERVER_EVENT.asrResponse, { results: [{ text: "入", is_interim: true }] }) });
    await Promise.resolve(); expect(transcript).not.toHaveBeenCalled();
    socket.onmessage?.({ data: serverFrame(VOLC_SERVER_EVENT.asrEnded, {}) });
    await Promise.resolve(); expect(transcript).toHaveBeenCalledWith("入"); transport.disconnect();
  });
  it("rejects a canceled handshake and ignores late frames before microphone startup", async () => {
    const transport = createDoubaoDialogVoiceTransport({ appId: "fixture-app", accessToken: "fixture-token" }, { DoubaoWebSocket: MockSocket });
    const connected = transport.connect({ url: "wss://doubao-volc", protocols: [], providerId: "doubao-volc", model: "2.2.0.0" });
    const socket = sockets[0]!; transport.disconnect();
    await expect(connected).rejects.toThrow("取消");
    socket.onmessage?.({ data: serverFrame(VOLC_SERVER_EVENT.sessionStarted, {}) });
    await Promise.resolve(); await Promise.resolve(); expect(startDoubaoMicCapture).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalled();
  });
});
