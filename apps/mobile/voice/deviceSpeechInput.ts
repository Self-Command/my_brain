import Voice, { type SpeechResultsEvent } from "@react-native-voice/voice";

let active = false;

export async function startDeviceStt(onTranscript: (text: string) => void, onSpeechActivity?: (partial?: string) => void): Promise<void> {
  await stopDeviceStt();
  Voice.onSpeechResults = (event: SpeechResultsEvent) => {
    const text = event.value?.[0]?.trim();
    if (text) {
      onTranscript(text);
    }
  };
  Voice.onSpeechStart = () => { if (active) onSpeechActivity?.(); };
  Voice.onSpeechPartialResults = (event: SpeechResultsEvent) => { if (active) onSpeechActivity?.(event.value?.[0]); };
  Voice.onSpeechEnd = () => {
    if (active) {
      void Voice.start("zh-CN").catch(() => undefined);
    }
  };
  Voice.onSpeechError = () => {
    if (active) {
      void Voice.start("zh-CN").catch(() => undefined);
    }
  };
  active = true;
  await Voice.start("zh-CN");
}

export async function stopDeviceStt(): Promise<void> {
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
