import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiJsonFallback } = await import("@/lib/ai/gemini");
const { aiModels } = await import("@/lib/ai/config");
const S = await import("@/lib/story/story");

const words = [
  { id: "00000000-0000-4000-8000-000000000001", english: "sink", uzbek: "rakovina" },
  { id: "00000000-0000-4000-8000-000000000002", english: "postpone", uzbek: "keyinga surmoq" },
  { id: "00000000-0000-4000-8000-000000000003", english: "reliable", uzbek: "ishonchli" },
  { id: "00000000-0000-4000-8000-000000000004", english: "give up", uzbek: "taslim bo'lmoq" },
];

describe("live weekly story", () => {
  for (const level of ["elementary", "ielts"] as const) {
    it(`writes a ${level} story with every word`, async () => {
      const raw = await geminiJsonFallback(aiModels("gemini"), {
        system: S.STORY_SYSTEM,
        user: S.storyUserMessage(S.storyRequestSchema.parse({ weekStart: "2026-11-23", level, words })),
        schema: S.STORY_JSON_SCHEMA,
        maxOutputTokens: 4096,
      });
      const story = S.storyReplySchema.parse(JSON.parse(raw));
      console.log(level, story.title, "\n", S.storyText(story), "\n", story.outline_uz);
      expect(S.missingWords(story, words)).toEqual([]);
      const n = S.storyText(story).split(/\s+/).length;
      const [min, max] = S.storyLevel(level).length;
      expect(n).toBeGreaterThan(min * 0.7);
      expect(n).toBeLessThan(max * 1.3);
    }, 90_000);
  }
});
