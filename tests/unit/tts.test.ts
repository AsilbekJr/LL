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
    // Engine never starts: 3 local attempts, then server speech (unavailable in this test).
    expect((await r).ok).toBe(false);
    expect(spoken).toHaveLength(3);

    install(() => "fail");
    const { speak: speak2 } = await import("@/lib/speech/tts");
    const r2 = speak2("hello");
    await vi.runAllTimersAsync();
    expect((await r2).ok).toBe(false);
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

describe("cloud fallback", () => {
  function installCloud() {
    const store = new Map<string, string>();
    const played: { src: string; rate: number }[] = [];
    class FakeAudio {
      playbackRate = 1;
      onended: (() => void) | null = null;
      onpause: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public src: string) {}
      play() {
        played.push({ src: this.src, rate: this.playbackRate });
        queueMicrotask(() => this.onended?.());
        return Promise.resolve();
      }
      pause() {}
    }
    vi.stubGlobal("Audio", FakeAudio);
    const fetchMock = vi.fn(async () => new Response(new Blob(["RIFF"], { type: "audio/wav" })));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:tts" }));
    const w = globalThis.window as unknown as Record<string, unknown>;
    w.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    };
    return { played, fetchMock, store };
  }

  it("uses server speech when the device engine fails, and remembers it", async () => {
    install(() => "fail");
    const { played, fetchMock, store } = installCloud();
    const { speak } = await import("@/lib/speech/tts");
    const r = speak("cheap", { rate: 0.8 });
    await vi.runAllTimersAsync();
    expect(await r).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/tts");
    expect(JSON.parse(init.body as string)).toEqual({ text: "cheap" });
    expect(played).toEqual([{ src: "blob:tts", rate: 0.8 }]);
    expect(store.has("ll.tts.engine")).toBe(true);

    // Next time: straight to the server, local engine untouched; audio cached in memory.
    const before = spoken.length;
    const r2 = speak("cheap");
    await vi.runAllTimersAsync();
    expect(await r2).toEqual({ ok: true });
    expect(spoken.length).toBe(before);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a server error and never plays the failed engine late", async () => {
    install(() => "fail");
    installCloud();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 429 })),
    );
    const { speak } = await import("@/lib/speech/tts");
    const r = speak("hello");
    await vi.runAllTimersAsync();
    expect(await r).toEqual({ ok: false, error: "cloud-429" });
  });

  it("only the newest request plays; identical phrases download once", async () => {
    install(() => "ok");
    const { played, fetchMock, store } = installCloud();
    store.set("ll.tts.engine", String(Date.now()));
    const { speak } = await import("@/lib/speech/tts");
    const a = speak("same");
    const b = speak("same");
    await vi.runAllTimersAsync();
    expect(await a).toEqual({ ok: true });
    expect(await b).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(played).toHaveLength(1);
    expect(spoken).toHaveLength(0);
  });
});

describe("settings voice test", () => {
  it("re-tries the device engine after a remembered failure", async () => {
    install(() => "ok");
    const store = new Map<string, string>([["ll.tts.engine", String(Date.now())]]);
    (globalThis.window as unknown as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    const { testDeviceVoice } = await import("@/lib/speech/tts");
    const r = testDeviceVoice("hello");
    await vi.runAllTimersAsync();
    expect(await r).toMatchObject({ engine: "device" });
    expect(store.has("ll.tts.engine")).toBe(false);
    expect(spoken).toHaveLength(1);
  });
});
