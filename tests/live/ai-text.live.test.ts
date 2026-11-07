import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiJson } = await import("@/lib/ai/gemini");
const { aiModel } = await import("@/lib/ai/config");
const { AI_TEXT_JSON_SCHEMA, AI_TEXT_SYSTEM, aiTextSchema, TEXT_LENGTH } =
  await import("@/lib/reading/ai-text");

describe("live gemini text", () => {
  it("writes an A2 text with the given words", async () => {
    const words = ["umbrella", "neighbour", "borrow", "forget", "station"];
    const t0 = Date.now();
    const raw = await geminiJson({
      model: aiModel("gemini"),
      system: AI_TEXT_SYSTEM,
      user: `CEFR level: A2 (${TEXT_LENGTH.A2})\nTopic: a rainy morning\n<target_words>\n${words.map((w) => `- ${w}`).join("\n")}\n</target_words>`,
      schema: AI_TEXT_JSON_SCHEMA,
      maxOutputTokens: 4096,
    });
    const text = aiTextSchema.parse(JSON.parse(raw));
    console.log(`${Date.now() - t0} ms`, JSON.stringify(text, null, 1));
    const body = text.sentences
      .map((s) => s.en)
      .join(" ")
      .toLowerCase();
    for (const w of ["umbrella", "neighbo", "borrow", "forg", "station"]) expect(body).toContain(w);
  }, 90_000);
});
