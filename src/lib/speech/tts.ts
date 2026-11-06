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

/**
 * Speak `text`. Starts synchronously (safe inside a click handler on mobile);
 * the returned promise resolves when speech ends, fails or times out.
 */
export function speak(text: string, opts: { rate?: number; voice?: string | null } = {}): Promise<void> {
  if (!canSpeak() || !text.trim()) return Promise.resolve();
  const synth = window.speechSynthesis;
  const rate = Math.min(2, Math.max(0.5, opts.rate ?? 1));

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const voice = bestVoice(voicesNow(), opts.voice ?? null);
  if (voice) u.voice = voice;

  synth.cancel(); // never queue up repeated taps
  if (synth.paused) synth.resume(); // Chrome can get stuck in "paused"
  current = u;

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (current === u) current = null;
      resolve();
    };
    u.onend = finish;
    u.onerror = finish;
    // Some engines never fire onend: give up after a generous estimate.
    setTimeout(finish, Math.max(4000, (text.length * 120) / rate));
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
