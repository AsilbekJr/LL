import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiJsonFallback } = await import("@/lib/ai/gemini");
const { aiModels } = await import("@/lib/ai/config");
const P = await import("@/lib/speaking/pyramid");
const J = await import("@/lib/speaking/judge");

describe("live pyramid", () => {
  it("builds a situation for a noun", async () => {
    for (const [english, uzbek, wordClass] of [
      ["sink", "rakovina, yuvinish taxtasi", "noun"],
      ["postpone", "kechiktirmoq, keyinga surmoq", "verb"],
    ] as const) {
      const raw = await geminiJsonFallback(aiModels("gemini"), {
        system: P.BUILDER_SYSTEM,
        user: P.builderUserMessage(
          P.builderRequestSchema.parse({ level: "A2", word: { english, uzbek }, wordClass }),
        ),
        schema: P.BUILDER_JSON_SCHEMA,
      });
      const b = P.builderSchema.parse(JSON.parse(raw));
      console.log(english, JSON.stringify(b));
      expect(b.model.toLowerCase()).toContain(english.slice(0, 4));
    }
  }, 90_000);

  it("judges a base step", async () => {
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: J.JUDGE_SYSTEM,
      user: J.judgeUserMessage({
        kind: "pyramid",
        said: "I washed the cups in the sink",
        level: "A2",
        word: { english: "sink", uzbek: "rakovina" },
        prompt: P.pyramidPrompt("base", null, "Kecha idishlarni rakovinada yuvdingiz."),
      }),
      schema: J.JUDGE_JSON_SCHEMA,
    });
    const j = J.judgeSchema.parse(JSON.parse(raw));
    console.log(JSON.stringify(j));
    expect(J.judgePassed(j)).toBe(true);
  }, 60_000);
});
