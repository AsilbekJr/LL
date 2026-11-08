import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiJsonFallback } = await import("@/lib/ai/gemini");
const { aiModels } = await import("@/lib/ai/config");
const { WORD_DETAILS_JSON_SCHEMA, WORD_DETAILS_SYSTEM, wordDetailsResponseSchema, wordDetailsUserMessage } =
  await import("@/lib/items/word-details");

describe("live word details", () => {
  it("fills example, translation, part of speech and an Uzbek note", async () => {
    const words = [
      {
        english: "book",
        uzbek: "band qilmoq",
        level: "A2",
        part_of_speech: "noun/verb",
        example_en: "I read a book.",
      },
      { english: "give up", uzbek: "taslim bo'lmoq", level: "B1" },
      { english: "reluctant", uzbek: "istamaydigan", level: "B2", example_en: "He was reluctant to help." },
    ];
    const t0 = Date.now();
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: WORD_DETAILS_SYSTEM,
      user: wordDetailsUserMessage(words),
      schema: WORD_DETAILS_JSON_SCHEMA,
      maxOutputTokens: 4096,
    });
    const out = wordDetailsResponseSchema.parse(JSON.parse(raw));
    console.log(`${Date.now() - t0} ms`, JSON.stringify(out, null, 1));
    expect(out.items).toHaveLength(3);
    // "book" given as "band qilmoq" (to reserve): the noun example must be replaced.
    expect(out.items[0]!.example_en).not.toBe("I read a book.");
    expect(out.items[2]!.example_en).toBe("He was reluctant to help.");
    for (const i of out.items) {
      expect(i.example_uz.length).toBeGreaterThan(3);
      expect(i.notes.length).toBeGreaterThan(3);
      expect(i.example_uz).not.toMatch(/[Ѐ-ӿ]/);
    }
  }, 90_000);
});
