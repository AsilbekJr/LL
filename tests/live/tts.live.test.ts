import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiSpeech } = await import("@/lib/ai/gemini");

it("speaks a sentence (WAV)", async () => {
  const t0 = Date.now();
  const r = await geminiSpeech({
    model: "gemini-3.8-flash-tts",
    voice: "Kore",
    text: "Tomatoes are cheap today too.",
  });
  console.log(`${Date.now() - t0} ms, ${r.audio.length} bytes, ${r.mimeType}`);
  expect(r.audio.subarray(0, 4).toString("latin1")).toBe("RIFF");
}, 60_000);
