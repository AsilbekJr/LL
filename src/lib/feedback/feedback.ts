/**
 * Small, immediate responses to an answer — a short sound, a tap of
 * vibration — so every action feels acknowledged. Sounds are synthesized
 * with Web Audio (no files to load). One switch for both, remembered on
 * this device; off when the OS asks for reduced motion is NOT assumed
 * (sound is not motion), but confetti respects it.
 */
export type FeedbackKind = "success" | "error" | "complete";

const KEY = "ll.feedback";

export function feedbackEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setFeedbackEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // storage off: lasts for this visit only
  }
}

/** [frequency Hz, start s, duration s] */
type Note = [number, number, number];

const SOUNDS: Record<FeedbackKind, { notes: Note[]; type: OscillatorType; gain: number }> = {
  // Two rising notes: a light "ding-ding".
  success: {
    notes: [
      [660, 0, 0.09],
      [988, 0.08, 0.16],
    ],
    type: "sine",
    gain: 0.12,
  },
  // One soft low note — a nudge, not a buzzer.
  error: { notes: [[220, 0, 0.18]], type: "triangle", gain: 0.1 },
  // A short major arpeggio for finishing something.
  complete: {
    notes: [
      [523, 0, 0.12],
      [659, 0.1, 0.12],
      [784, 0.2, 0.12],
      [1047, 0.3, 0.28],
    ],
    type: "sine",
    gain: 0.12,
  },
};

const VIBRATION: Record<FeedbackKind, number | number[]> = {
  success: 15,
  error: [30, 40, 30],
  complete: [20, 40, 20, 40, 40],
};

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  return ctx;
}

function play(kind: FeedbackKind) {
  const ac = audio();
  if (!ac) return;
  const { notes, type, gain } = SOUNDS[kind];
  const now = ac.currentTime;
  for (const [freq, start, dur] of notes) {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    // Quick attack, smooth release: no clicks.
    amp.gain.setValueAtTime(0, now + start);
    amp.gain.linearRampToValueAtTime(gain, now + start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  }
}

/** Sound + vibration for one moment. Never throws. */
export function feedback(kind: FeedbackKind): void {
  if (typeof window === "undefined" || !feedbackEnabled()) return;
  try {
    play(kind);
  } catch {
    // no audio: fine
  }
  try {
    navigator.vibrate?.(VIBRATION[kind]);
  } catch {
    // no vibration (iOS): fine
  }
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Confetti for real milestones only (a word became active, a story retold,
 * a session finished) — used rarely so it keeps meaning something.
 */
export async function celebrate(size: "small" | "big" = "small"): Promise<void> {
  if (typeof window === "undefined" || reducedMotion()) return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    const colors = ["#3b4aa8", "#16a34a", "#f5c542", "#e86f51"];
    if (size === "small") {
      await confetti({
        particleCount: 60,
        spread: 70,
        startVelocity: 35,
        origin: { y: 0.7 },
        colors,
        disableForReducedMotion: true,
      });
      return;
    }
    const end = Date.now() + 900;
    const frame = () => {
      void confetti({
        particleCount: 6,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.75 },
        colors,
        disableForReducedMotion: true,
      });
      void confetti({
        particleCount: 6,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.75 },
        colors,
        disableForReducedMotion: true,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  } catch {
    // confetti is a garnish
  }
}
