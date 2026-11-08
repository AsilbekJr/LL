import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiJsonFallback } = await import("@/lib/ai/gemini");
const { aiModels } = await import("@/lib/ai/config");
const F = await import("@/lib/speaking/fit");
const { PATTERNS, fitsSlot } = await import("@/lib/production/patterns");

async function fits(word: { english: string; uzbek: string; pos: string }, level: string) {
  const patterns = PATTERNS.filter(
    (p) =>
      p.level === level &&
      fitsSlot(p.slot, { type: "word", english: word.english, part_of_speech: word.pos }),
  ).map((p) => ({ id: p.id, en: p.en }));
  const raw = await geminiJsonFallback(aiModels("gemini"), {
    system: F.FIT_SYSTEM,
    user: F.fitUserMessage({ level, word, patterns }),
    schema: F.FIT_JSON_SCHEMA,
  });
  console.log(word.english, raw);
  const out = F.fitsFromChecks(JSON.parse(raw), new Set(patterns.map((p) => p.id)))!;
  return out.fits.map((f) => f.id);
}

describe("live pattern fit", () => {
  it("does not pair 'guy' with 'Can I have ___, please?'", async () => {
    const ids = await fits({ english: "guy", uzbek: "yigit, odam", pos: "noun" }, "A1");
    expect(ids).not.toContain("a1-can-have");
    expect(ids).not.toContain("a1-favorite");
  }, 60_000);

  it("keeps natural pairs", async () => {
    const ids = await fits({ english: "water", uzbek: "suv", pos: "noun" }, "A1");
    expect(ids).toContain("a1-can-have");
  }, 60_000);

  it("rejects 'sleepy' in 'It's too ___ for me'", async () => {
    const ids = await fits({ english: "sleepy", uzbek: "uyqusiragan", pos: "adjective" }, "A2");
    expect(ids).not.toContain("a2-too");
  }, 60_000);
});
