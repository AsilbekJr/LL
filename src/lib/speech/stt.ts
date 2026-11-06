/**
 * Speech-to-text via the Web Speech API (Chrome/Edge/Safari; not Firefox).
 * Audio is processed by the browser vendor; nothing is sent to our server.
 */

// Minimal typings: the API is not in TypeScript's DOM lib.
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly 0: { transcript: string };
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canRecognize(): boolean {
  return ctor() !== null;
}

export type SttError = "not-allowed" | "no-speech" | "network" | "unsupported" | "other";

export interface Listener {
  stop(): void;
  abort(): void;
}

/**
 * Start listening. `onText` receives the full transcript so far (final + interim).
 * `onEnd` fires once with the final transcript or an error.
 */
export function listen(opts: {
  lang?: string;
  onText: (text: string) => void;
  onEnd: (finalText: string, error?: SttError) => void;
}): Listener | null {
  const Ctor = ctor();
  if (!Ctor) {
    opts.onEnd("", "unsupported");
    return null;
  }
  const rec = new Ctor();
  rec.lang = opts.lang ?? "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  let finalText = "";
  let interim = "";
  let error: SttError | undefined;

  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]!;
      if (r.isFinal) finalText = `${finalText} ${r[0].transcript}`.trim();
      else interim += r[0].transcript;
    }
    opts.onText(`${finalText} ${interim}`.trim());
  };
  rec.onerror = (e) => {
    error =
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "not-allowed"
        : e.error === "no-speech"
          ? "no-speech"
          : e.error === "network"
            ? "network"
            : e.error === "aborted"
              ? undefined
              : "other";
  };
  rec.onend = () => opts.onEnd(`${finalText} ${interim}`.trim(), error);

  rec.start();
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}
