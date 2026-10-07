import Voice, { type SpeechResultsEvent } from "@react-native-voice/voice";

let active = false;
let generation = 0;
let nativeWork: Promise<void> = Promise.resolve();
function serialize(work: () => Promise<void>): Promise<void> {
  const result = nativeWork.then(work, work);
  nativeWork = result.catch(() => undefined);
  return result;
}

export async function startDeviceStt(onTranscript: (text: string) => void, onSpeechActivity?: (partial?: string) => void): Promise<void> {
  const epoch = ++generation;
  await serialize(async () => {
  await stopNativeStt();
  if (epoch !== generation) throw new Error("设备识别已取消");
  if (!await Voice.isAvailable()) throw new Error("设备未安装可用的语音识别服务，可继续使用文字功能");
  if (epoch !== generation) throw new Error("设备识别已取消");
  Voice.onSpeechResults = (event: SpeechResultsEvent) => {
    if (!active || epoch !== generation) return;
    const text = event.value?.[0]?.trim();
    if (text) {
      onTranscript(text);
    }
    restart();
  };
  Voice.onSpeechStart = () => { if (active && epoch === generation) onSpeechActivity?.(); };
  Voice.onSpeechPartialResults = (event: SpeechResultsEvent) => { if (active && epoch === generation) onSpeechActivity?.(event.value?.[0]); };
  const restart = () => {
    if (active && epoch === generation) void serialize(async () => {
      if (!active || epoch !== generation) return;
      await Voice.start("zh-CN");
      if (epoch !== generation) await stopNativeStt();
    }).catch(() => undefined);
  };
  // Android requires waiting for final results/error before restarting recognition.
  Voice.onSpeechEnd = () => {};
  Voice.onSpeechError = () => {
    restart();
  };
  active = true;
  try { await Voice.start("zh-CN"); } catch (failure) { active = false; throw failure; }
  if (epoch !== generation) { await stopNativeStt(); throw new Error("设备识别已取消"); }
  });
}

export async function stopDeviceStt(): Promise<void> {
  generation++; active = false;
  await serialize(stopNativeStt);
}
async function stopNativeStt(): Promise<void> {
  active = false;
  try {
    await Voice.stop();
  } catch {
    // ignore when not started
  }
  try {
    await Voice.destroy();
  } catch {
    // ignore
  }
  Voice.removeAllListeners();
}
