/**
 * Text-to-speech via the Web Speech API (no network, no key). English voices
 * only; when none is available the listening exercise falls back to spelling.
 *
 * Mobile browsers (iOS Safari in particular) only allow speech that starts
 * synchronously inside a user gesture, so `speak()` must call
 * `speechSynthesis.speak()` before any `await`. Voices are therefore read
 * synchronously (they are cached as soon as the browser loads them).
 */
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
 * Speak `text`. Starts synchronously (safe inside a click handler on mobile);
 * the returned promise resolves when speech ends, fails or times out.
 *
 * Mobile engines sometimes drop an utterance silently (Android right after
 * `cancel()`, iOS after a blocked one), so if nothing has started shortly
 * after, it is retried once; if it still does not start, the result says so.
 */
export function speak(
  text: string,
  opts: { rate?: number; voice?: string | null } = {},
): Promise<SpeakResult> {
  if (!canSpeak()) return Promise.resolve({ ok: false, error: "unsupported" });
  if (!text.trim()) return Promise.resolve({ ok: true });
  const synth = window.speechSynthesis;
  const rate = Math.min(2, Math.max(0.5, opts.rate ?? 1));
  const voice = bestVoice(voicesNow(), opts.voice ?? null);

  return new Promise<SpeakResult>((resolve) => {
    let settled = false;
    let started = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (r: SpeakResult) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      current = null;
      resolve(r);
    };

    const say = () => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice ? voice.lang.replace("_", "-") : "en-US";
      u.rate = rate;
      if (voice) u.voice = voice;
      u.onstart = () => {
        started = true;
      };
      u.onend = () => current === u && finish({ ok: true });
      u.onerror = (e) => {
        if (current !== u) return;
        // Our own cancel() (a new tap) is not a failure.
        if (e.error === "interrupted" || e.error === "canceled") finish({ ok: true });
        else finish({ ok: false, error: e.error || "error" });
      };
      current = u;
      synth.speak(u);
    };

    // Only cancel when something is queued: cancel() immediately followed by
    // speak() makes some mobile engines drop the new utterance.
    if (synth.speaking || synth.pending) synth.cancel();
    if (synth.paused) synth.resume(); // Chrome can get stuck in "paused"
    say();

    const isStarted = () => started || synth.speaking;
    timers.push(
      setTimeout(() => {
        if (settled || isStarted()) return;
        synth.cancel();
        say();
        timers.push(
          setTimeout(() => {
            if (!settled && !isStarted()) finish({ ok: false, error: "not-started" });
          }, 2000),
        );
      }, 900),
    );
    // Some engines never fire onend: give up after a generous estimate.
    timers.push(setTimeout(() => finish({ ok: true }), 3000 + Math.max(4000, (text.length * 120) / rate)));
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
