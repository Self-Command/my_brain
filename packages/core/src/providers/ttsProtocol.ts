import { normalizeServiceBaseUrl, type ServiceProfile } from "./serviceConfig.js";

export function buildTtsRequest(profile: ServiceProfile, text: string) {
  if (profile.role !== "tts" || !profile.modelId.trim() || !profile.voiceId?.trim() || !text.trim()) throw new Error("请填写 TTS 模型与音色 ID");
  if (/voiceclone|voicedesign/.test(profile.modelId)) throw new Error("本版本不支持需要参考音频或设计参数的模型");
  const base = normalizeServiceBaseUrl(profile.baseUrl);
  if (profile.adapterId === "openai-audio-speech") return {
    url: `${base}/audio/speech`, sampleRateHz: 24000,
    body: JSON.stringify({ model: profile.modelId, input: text, voice: profile.voiceId, response_format: "pcm" }), streamingSse: false,
  };
  if (profile.adapterId !== "chat-completions-audio") throw new Error("不支持的 TTS 协议");
  return { url: `${base}/chat/completions`, sampleRateHz: 24000, streamingSse: true,
    body: JSON.stringify({ model: profile.modelId, stream: true, messages: [
      ...(profile.style?.trim() ? [{ role: "user", content: profile.style.trim() }] : []),
      { role: "assistant", content: text },
    ], audio: { format: "pcm16", voice: profile.voiceId } }),
  };
}
export function decodeAudioBase64(data: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) throw new Error("音频 Base64 无效");
  const raw = atob(data);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
export class PcmFramer {
  private carry = new Uint8Array(0);
  push(chunk: Uint8Array): Uint8Array {
    const bytes = new Uint8Array(this.carry.length + chunk.length);
    bytes.set(this.carry); bytes.set(chunk, this.carry.length);
    const end = bytes.length - bytes.length % 2;
    this.carry = bytes.slice(end);
    return bytes.slice(0, end);
  }
  finish() { if (this.carry.length) throw new Error("PCM 音频包含不完整采样"); }
}
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}
export class SseAudioDecoder {
  private text = "";
  private bytes = new Uint8Array(0);
  private ended = false;
  push(part: Uint8Array): Uint8Array[] {
    const bytes = new Uint8Array(this.bytes.length + part.length);
    bytes.set(this.bytes); bytes.set(part, this.bytes.length);
    let end = bytes.length;
    let lead = end - 1;
    while (lead >= 0 && (bytes[lead]! & 0xc0) === 0x80) lead--;
    if (lead >= 0) {
      const byte = bytes[lead]!;
      const size = byte < 0x80 ? 1 : byte < 0xe0 ? 2 : byte < 0xf0 ? 3 : 4;
      if (lead + size > end) end = lead;
    }
    this.bytes = bytes.slice(end);
    let escaped = "";
    for (const byte of bytes.slice(0, end)) escaped += `%${byte.toString(16).padStart(2, "0")}`;
    this.text += decodeURIComponent(escaped);
    if (this.text.length > 1_048_576) throw new Error("音频事件超出大小限制");
    const chunks: Uint8Array[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.text))) {
      const event = this.text.slice(0, match.index);
      this.text = this.text.slice(match.index + match[0].length);
      chunks.push(...this.parse(event));
    }
    return chunks;
  }
  finish(): Uint8Array[] {
    if (this.bytes.length) throw new Error("音频事件 UTF-8 不完整");
    const result = this.parse(this.text); this.text = ""; return result;
  }
  private parse(event: string): Uint8Array[] {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || this.ended) return [];
    if (data.trim() === "[DONE]") { this.ended = true; return []; }
    const body = asRecord(JSON.parse(data) as unknown);
    if (body?.error) throw new Error("TTS 服务返回合成错误");
    const choices = body?.choices;
    const first = Array.isArray(choices) ? asRecord(choices[0]) : undefined;
    const delta = asRecord(first?.delta);
    const audio = asRecord(delta?.audio);
    return typeof audio?.data === "string" && audio.data ? [decodeAudioBase64(audio.data)] : [];
  }
}
