import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiJsonFallback } = await import("@/lib/ai/gemini");
const { aiModels } = await import("@/lib/ai/config");
const C = await import("@/lib/items/context-sentences");

describe("live context sentences", () => {
  it("writes 5 sentences in different situations", async () => {
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: C.CONTEXT_SYSTEM,
      user: C.contextUserMessage({
        english: "sink",
        uzbek: "rakovina, yuvinish taxtasi",
        part_of_speech: "noun",
        cefr_level: "A2",
      }),
      schema: C.CONTEXT_JSON_SCHEMA,
    });
    const reply = C.contextReplySchema.parse(JSON.parse(raw));
    const clean = C.cleanGenerated(reply.sentences, "sink");
    console.log(JSON.stringify(clean, null, 2));
    expect(clean.length).toBe(C.CONTEXT_COUNT);
    expect(new Set(clean.map((s) => s.situation)).size).toBeGreaterThanOrEqual(4);
  }, 60_000);
});
