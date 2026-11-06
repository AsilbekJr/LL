/**
 * Text-to-speech via the Web Speech API (no network, no key). English voices
 * only; when none is available the listening exercise falls back to spelling.
 */
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

/** Voices load asynchronously in Chrome; wait for them once (max 1.5 s). */
export function englishVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  voicesReady ??= new Promise((resolve) => {
    const pick = () =>
      window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
    const now = pick();
    if (now.length) return resolve(now);
    const done = () => resolve(pick());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
  return voicesReady;
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

export async function speak(
  text: string,
  opts: { rate?: number; voice?: string | null } = {},
): Promise<void> {
  if (!canSpeak() || !text.trim()) return;
  const voices = await englishVoices();
  const synth = window.speechSynthesis;
  synth.cancel(); // never queue up repeated taps
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = Math.min(2, Math.max(0.5, opts.rate ?? 1));
  const voice = bestVoice(voices, opts.voice ?? null);
  if (voice) u.voice = voice;
  await new Promise<void>((resolve) => {
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}
