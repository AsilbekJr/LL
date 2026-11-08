import { describe, expect, it, vi } from "vitest";
import { pickSensiblePattern } from "@/lib/speaking/pattern-pick";
import type { FitRequest } from "@/lib/speaking/fit";

const guy = { id: "g", type: "word", english: "guy", uzbek: "yigit", part_of_speech: "noun" };
const water = { id: "w", type: "word", english: "water", uzbek: "suv", part_of_speech: "noun" };
const first = () => 0;

describe("pickSensiblePattern", () => {
  it("only uses a frame the AI says makes sense for the word", async () => {
    const fits = vi.fn(async (req: FitRequest) =>
      req.word.english === "water"
        ? [
            {
              id: "a1-can-have",
              sentence: "Can I have some water, please?",
              sentence_uz: "Suv bera olasizmi?",
            },
          ]
        : [],
    );
    const p = await pickSensiblePattern({ level: "A1", items: [guy, water], random: first, fits });
    expect(p?.item.english).toBe("water");
    expect(p?.pattern.id).toBe("a1-can-have");
    expect(p?.model?.sentence).toContain("water");
  });

  it("asks only about frames of the right level and part of speech", async () => {
    const fits = vi.fn(
      async (_req: FitRequest) => [] as { id: string; sentence: string; sentence_uz: string }[],
    );
    await pickSensiblePattern({ level: "A1", items: [guy], random: first, fits });
    const asked = fits.mock.calls[0]![0].patterns.map((p: { id: string }) => p.id);
    expect(asked).toContain("a1-can-have");
    expect(asked.every((id) => id.startsWith("a1-"))).toBe(true);
    expect(asked).not.toContain("a1-want"); // verb frame
  });

  it("ignores frame ids that were not asked about", async () => {
    const fits = async () => [{ id: "c2-under-no", sentence: "x", sentence_uz: "" }];
    expect(await pickSensiblePattern({ level: "A1", items: [guy], random: first, fits })).toBeNull();
  });

  it("returns null when no word fits sensibly", async () => {
    expect(
      await pickSensiblePattern({ level: "A1", items: [guy, water], random: first, fits: async () => [] }),
    ).toBeNull();
  });

  it("falls back to part-of-speech matching without AI", async () => {
    const p = await pickSensiblePattern({ level: "A1", items: [guy], random: first, fits: async () => null });
    expect(p?.item).toBe(guy);
    expect(p?.model).toBeNull();
  });

  it("'other word' keeps the frame and skips the current word", async () => {
    const fits = vi.fn(async (req: FitRequest) =>
      req.patterns.map((p) => ({ id: p.id, sentence: `${req.word.english}!`, sentence_uz: "" })),
    );
    const p = await pickSensiblePattern({
      level: "A1",
      items: [guy, water],
      random: first,
      fits,
      pattern: "a1-like",
      excludeItem: "g",
    });
    expect(p).toMatchObject({ item: water, pattern: { id: "a1-like" } });
  });
});
