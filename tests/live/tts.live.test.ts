import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiSpeech } = await import("@/lib/ai/gemini");
const { wavToMp3 } = await import("@/lib/ai/mp3");

it.each(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"])(
  "%s speaks; MP3 is much smaller",
  async (model) => {
    const t0 = Date.now();
    const r = await geminiSpeech({ model, voice: "Kore", text: "Tomatoes are cheap today too." });
    const ms = Date.now() - t0;
    expect(r.audio.subarray(0, 4).toString("latin1")).toBe("RIFF");
    const t1 = Date.now();
    const mp3 = wavToMp3(new Uint8Array(r.audio));
    console.log(
      `${model}: ${ms} ms, WAV ${r.audio.length} B -> MP3 ${mp3.length} B in ${Date.now() - t1} ms`,
    );
    // MPEG frame sync (0xFFE...) at the start
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1]! & 0xe0).toBe(0xe0);
    expect(mp3.length).toBeLessThan(r.audio.length / 4);
  },
  60_000,
);
