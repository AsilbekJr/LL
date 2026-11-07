/**
 * Text-to-speech via the Web Speech API (no network, no key). English voices
 * only; when none is available the listening exercise falls back to spelling.
 *
 * Mobile browsers (iOS Safari in particular) only allow speech that starts
 * synchronously inside a user gesture, so `speak()` must call
 * `speechSynthesis.speak()` before any `await`. Voices are therefore read
 * synchronously (they are cached as soon as the browser loads them).
 */
import { markLocalBroken, prefetchCloud, preferCloud, speakCloud, stopCloud } from "./cloud-tts";

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

const isEnglish = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith("en");

let listening = false;
let cached: SpeechSynthesisVoice[] = [];

/** English voices available right now (may be empty until the browser loads them). */
function voicesNow(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  if (!listening) {
    listening = true;
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      cached = window.speechSynthesis.getVoices().filter(isEnglish);
    });
  }
  const now = window.speechSynthesis.getVoices().filter(isEnglish);
  if (now.length) cached = now;
  return cached;
}

/** Voices load asynchronously in Chrome; wait for them (max 1.5 s). For settings UIs. */
export function englishVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  const now = voicesNow();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(voicesNow());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Warm up the voice list early (call once on the client). */
export function preloadVoices(): void {
  voicesNow();
}

function bestVoice(
  voices: SpeechSynthesisVoice[],
  preferred: string | null,
): SpeechSynthesisVoice | undefined {
  return (
    voices.find((v) => v.voiceURI === preferred || v.name === preferred) ??
    voices.find((v) => v.lang === "en-US" && v.localService) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang === "en-GB") ??
    voices[0]
  );
}

// Chrome can garbage-collect an utterance mid-speech (onend never fires);
// keeping a reference to the current one prevents that.
let current: SpeechSynthesisUtterance | null = null;

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/**
 * Whether speech may start without a tap. iOS only speaks inside a tap, and an
 * utterance queued outside one can leave the engine stuck, so never there.
 */
export function canAutoplay(): boolean {
  if (!canSpeak() || isIOS()) return false;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

export type SpeakResult = { ok: true } | { ok: false; error: string };

/**
 * How an utterance is configured. Android engines often fail with
 * "synthesis-failed" when given a voice object (or a language) that the
 * phone's default TTS engine cannot render, so we fall back step by step:
 * the chosen voice -> language only -> the engine's own defaults.
 */
type Mode = "voice" | "lang" | "bare";
let workingMode: Mode | null = null;

const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

function modes(hasVoice: boolean, userPicked: boolean): Mode[] {
  const order: Mode[] = isAndroid() && !userPicked ? ["lang", "voice", "bare"] : ["voice", "lang", "bare"];
  const list = order.filter((m) => m !== "voice" || hasVoice);
  // Start with whatever worked last time on this device.
  return workingMode && list.includes(workingMode)
    ? [workingMode, ...list.filter((m) => m !== workingMode)]
    : list;
}

/**
 * Speak `text`. Starts synchronously (safe inside a click handler on mobile);
 * the returned promise resolves when speech ends, fails or times out.
 *
 * If the engine reports an error or nothing starts shortly after, the next
 * configuration is tried (see `Mode`); the result reports the last error.
 */
/** Errors meaning this device's speech engine itself cannot speak English. */
const ENGINE_ERRORS = new Set([
  "synthesis-failed",
  "synthesis-unavailable",
  "language-unavailable",
  "voice-unavailable",
  "not-started",
  "unsupported",
]);

/**
 * Speak `text`: the device's own engine first (instant, offline); when that
 * engine is broken, server speech (Gemini TTS) — remembered for a week.
 * The local engine starts synchronously, so this is safe in a tap handler.
 */
let request = 0;

export async function speak(
  text: string,
  opts: { rate?: number; voice?: string | null } = {},
): Promise<SpeakResult> {
  if (!text.trim()) return { ok: true };
  const rate = opts.rate ?? 1;
  if (typeof window === "undefined") return { ok: false, error: "unsupported" };
  const id = ++request;
  if (preferCloud() || !canSpeak()) return speakCloud(text, rate);
  const local = await speakLocal(text, opts);
  // A newer tap took over while the engine was failing: never play this one late.
  if (id !== request) return { ok: true };
  if (local.ok || !ENGINE_ERRORS.has(local.error)) return local;
  // The engine is broken on this device: silence it for good and use server speech.
  if (canSpeak()) window.speechSynthesis.cancel();
  markLocalBroken();
  const cloud = await speakCloud(text, rate);
  return cloud;
}

/** On devices that use server speech, download upcoming phrases ahead of time. */
export function prefetchSpeech(texts: string[]): void {
  if (typeof window === "undefined" || !preferCloud()) return;
  void prefetchCloud(texts);
}

function speakLocal(text: string, opts: { rate?: number; voice?: string | null } = {}): Promise<SpeakResult> {
  if (!canSpeak()) return Promise.resolve({ ok: false, error: "unsupported" });
  if (!text.trim()) return Promise.resolve({ ok: true });
  const synth = window.speechSynthesis;
  const rate = Math.min(2, Math.max(0.5, opts.rate ?? 1));
  const voice = bestVoice(voicesNow(), opts.voice ?? null);
  const attempts = modes(Boolean(voice), Boolean(opts.voice));

  return new Promise<SpeakResult>((resolve) => {
    let settled = false;
    let started = false;
    let attempt = -1;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let lastError = "not-started";
    // Declared before `finish` (which clears it); set once speaking has begun.
    const deadline: { id?: ReturnType<typeof setTimeout> } = {};
    const finish = (r: SpeakResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      clearTimeout(deadline.id);
      current = null;
      resolve(r);
    };

    const next = () => {
      attempt++;
      const mode = attempts[attempt];
      if (!mode) return finish({ ok: false, error: lastError });
      if (attempt > 0) synth.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      if (mode === "voice" && voice) {
        u.voice = voice;
        u.lang = voice.lang.replace("_", "-");
      } else if (mode === "lang") {
        u.lang = "en-US";
      }
      u.onstart = () => {
        // The engine started late, after we gave up on this attempt: silence it
        // (otherwise the phrase plays twice — late here and from the fallback).
        if (settled || current !== u) {
          synth.cancel();
          return;
        }
        started = true;
        workingMode = mode;
      };
      u.onend = () => {
        if (current !== u) return;
        if (started || synth.speaking) workingMode = mode;
        finish({ ok: true });
      };
      u.onerror = (e) => {
        if (current !== u) return;
        // Our own cancel() (a new tap) is not a failure.
        if (e.error === "interrupted" || e.error === "canceled") return finish({ ok: true });
        lastError = e.error || "error";
        if (started) return finish({ ok: false, error: lastError });
        if (workingMode === mode) workingMode = null;
        next();
      };
      current = u;
      synth.speak(u);

      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (!settled && !started && !synth.speaking && current === u) next();
      }, 1200);
    };

    // Only cancel when something is queued: cancel() immediately followed by
    // speak() makes some mobile engines drop the new utterance.
    if (synth.speaking || synth.pending) synth.cancel();
    if (synth.paused) synth.resume(); // Chrome can get stuck in "paused"
    next();

    // Some engines never fire onend: give up after a generous estimate.
    deadline.id = setTimeout(
      () => finish({ ok: true }),
      4000 * attempts.length + Math.max(4000, (text.length * 120) / rate),
    );
  });
}

export function stopSpeaking(): void {
  request++;
  stopCloud();
  if (canSpeak()) window.speechSynthesis.cancel();
}
