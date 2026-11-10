import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiJsonFallback } = await import("@/lib/ai/gemini");
const { aiModels } = await import("@/lib/ai/config");
const W = await import("@/lib/items/word-details");

/** Words the built-in dictionary does not have: the AI supplies the translation. */
async function lookup(words: string[]) {
  const raw = await geminiJsonFallback(aiModels("gemini"), {
    system: W.WORD_DETAILS_SYSTEM,
    user: W.wordDetailsUserMessage(words.map((english) => ({ english, uzbek: "" }))),
    schema: W.WORD_DETAILS_JSON_SCHEMA,
    maxOutputTokens: 4096,
  });
  const items = W.wordDetailsResponseSchema.parse(JSON.parse(raw)).items;
  console.log(JSON.stringify(items, null, 1));
  return items;
}

describe("live word lookup", () => {
  it("translates words missing from the dictionary", async () => {
    const [puddle, giveIn] = await lookup(["puddle", "give in"]);
    expect(puddle!.uzbek.toLowerCase()).toMatch(/ko'lmak|ko‘lmak|kolmak/);
    expect(puddle!.level).toMatch(/^[ABC][12]$/);
    expect(puddle!.example_en.toLowerCase()).toContain("puddle");
    expect(puddle!.example_uz.length).toBeGreaterThan(5);
    expect(giveIn!.uzbek.length).toBeGreaterThan(2);
  }, 60_000);

  it("returns no translation for a non-word", async () => {
    const [x] = await lookup(["qzxvbt"]);
    expect(x!.uzbek.trim()).toBe("");
  }, 60_000);

  it("keeps a meaning the learner gave", async () => {
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: W.WORD_DETAILS_SYSTEM,
      user: W.wordDetailsUserMessage([{ english: "bank", uzbek: "qirg'oq" }]),
      schema: W.WORD_DETAILS_JSON_SCHEMA,
    });
    const [bank] = W.wordDetailsResponseSchema.parse(JSON.parse(raw)).items;
    expect(bank!.uzbek).toBe("qirg'oq");
    expect(bank!.example_en.toLowerCase()).toMatch(/river|shore|bank/);
  }, 60_000);
});
