import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Fake Web Speech engine: `behave` decides what each utterance does. */
type Behaviour = "ok" | "fail" | "silent";
let spoken: { lang: string; voice: unknown }[] = [];

function install(behave: (n: number, u: { lang: string; voice: unknown }) => Behaviour, ua = "Android") {
  spoken = [];
  class Utterance {
    lang = "";
    rate = 1;
    voice: unknown = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(public text: string) {}
  }
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    cancel: vi.fn(),
    resume: vi.fn(),
    getVoices: () => [{ name: "English US", voiceURI: "en-us", lang: "en_US", localService: true }],
    addEventListener: vi.fn(),
    speak(u: Utterance) {
      const n = spoken.length;
      spoken.push({ lang: u.lang, voice: u.voice });
      const b = behave(n, u);
      queueMicrotask(() => {
        if (b === "fail") u.onerror?.({ error: "synthesis-failed" });
        if (b === "ok") {
          u.onstart?.();
          u.onend?.();
        }
      });
    },
  };
  vi.stubGlobal("window", { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance });
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
  vi.stubGlobal("navigator", { userAgent: ua, maxTouchPoints: 0 });
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("speak fallbacks", () => {
  it("falls back to engine defaults after synthesis-failed (Android)", async () => {
    install((n) => (n < 2 ? "fail" : "ok"));
    const { speak } = await import("@/lib/speech/tts");
    const r = speak("weekend");
    await vi.runAllTimersAsync();
    expect(await r).toEqual({ ok: true });
    // Android without a picked voice: lang only -> voice -> bare
    expect(spoken.map((s) => [s.lang, Boolean(s.voice)])).toEqual([
      ["en-US", false],
      ["en-US", true],
      ["", false],
    ]);
  });

  it("remembers the mode that worked", async () => {
    install((n) => (n < 2 ? "fail" : "ok"));
    const { speak } = await import("@/lib/speech/tts");
    const first = speak("one");
    await vi.runAllTimersAsync();
    await first;
    const second = speak("two");
    await vi.runAllTimersAsync();
    expect(await second).toEqual({ ok: true });
    expect(spoken.at(-1)).toEqual({ lang: "", voice: null });
    expect(spoken).toHaveLength(4);
  });

  it("retries when nothing starts, and reports the error when all fail", async () => {
    install(() => "silent");
    const { speak } = await import("@/lib/speech/tts");
    const r = speak("hello");
    await vi.runAllTimersAsync();
    expect(await r).toEqual({ ok: false, error: "not-started" });
    expect(spoken).toHaveLength(3);

    install(() => "fail");
    const { speak: speak2 } = await import("@/lib/speech/tts");
    const r2 = speak2("hello");
    await vi.runAllTimersAsync();
    expect(await r2).toEqual({ ok: false, error: "synthesis-failed" });
  });

  it("uses the voice first on desktop", async () => {
    install(() => "ok", "Mozilla/5.0 (Windows NT 10.0)");
    const { speak } = await import("@/lib/speech/tts");
    const r = speak("hi");
    await vi.runAllTimersAsync();
    await r;
    expect(spoken[0]).toMatchObject({ lang: "en-US" });
    expect(spoken[0]!.voice).toBeTruthy();
  });
});
