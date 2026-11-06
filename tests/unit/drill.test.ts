import { describe, expect, it } from "vitest";
import { pickDrillTargets, scoreDrill, shadowSentence } from "@/lib/production/drill";
import { contextById, pickContext, productionPrompt } from "@/lib/production/contexts";
import {
  aiFeedbackRequestSchema,
  aiFeedbackSchema,
  AI_FEEDBACK_JSON_SCHEMA,
} from "@/lib/production/feedback";

const items = [
  { id: "1", type: "word", english: "deadline" },
  { id: "2", type: "phrase", english: "apply for" },
  { id: "3", type: "word", english: "salary" },
  { id: "4", type: "phrase", english: "set up" },
  { id: "5", type: "word", english: "reliable" },
  { id: "6", type: "sentence", english: "I'll get back to you." },
];

describe("drill", () => {
  it("picks 3–5 non-sentence targets", () => {
    for (const r of [0, 0.5, 0.99]) {
      const picked = pickDrillTargets(items, () => r);
      expect(picked.length).toBeGreaterThanOrEqual(3);
      expect(picked.length).toBeLessThanOrEqual(5);
      expect(picked.every((p) => p.type !== "sentence")).toBe(true);
      expect(new Set(picked.map((p) => p.id)).size).toBe(picked.length);
    }
  });

  it("falls back to any items when there are too few words", () => {
    expect(pickDrillTargets(items.slice(4), () => 0).length).toBe(2);
  });

  it("scores which targets were used", () => {
    const s = scoreDrill(
      "I applied for a job and the salary is good but the deadline was tight",
      items.slice(0, 4),
    );
    expect(s.count).toBe(3);
    expect([...s.used].sort()).toEqual(["1", "2", "3"]);
  });

  it("chooses a shadowing sentence", () => {
    expect(shadowSentence({ type: "sentence", english: "Nice to meet you.", example_en: null })).toBe(
      "Nice to meet you.",
    );
    expect(shadowSentence({ type: "word", english: "run", example_en: "I run every day." })).toBe(
      "I run every day.",
    );
    expect(shadowSentence({ type: "word", english: "run", example_en: null })).toBeNull();
  });
});

describe("contexts", () => {
  it("builds Uzbek prompts and avoids repeating the previous context", () => {
    expect(productionPrompt("deadline", "work", "written")).toBe(
      "“deadline” so'zini ishlatib, ishingiz yoki kasbingiz haqida gap yozing.",
    );
    expect(contextById("nope").id).toBe("daily");
    for (let i = 0; i < 20; i++) expect(pickContext(Math.random, "work").id).not.toBe("work");
  });
});

describe("AI feedback schemas", () => {
  it("validates requests and responses", () => {
    expect(aiFeedbackRequestSchema.safeParse({ text: "hi", english: "hello", mode: "written" }).success).toBe(
      true,
    );
    expect(aiFeedbackRequestSchema.safeParse({ text: "", english: "hello", mode: "written" }).success).toBe(
      false,
    );
    expect(
      aiFeedbackSchema.safeParse({
        word_used_correctly: true,
        natural: true,
        errors: [],
        corrected: "I booked a room.",
        tip_uz: "Zo'r!",
      }).success,
    ).toBe(true);
  });

  it("JSON schema requires every property and forbids extras (structured outputs)", () => {
    expect([...AI_FEEDBACK_JSON_SCHEMA.required].sort()).toEqual(
      Object.keys(AI_FEEDBACK_JSON_SCHEMA.properties).sort(),
    );
    expect(AI_FEEDBACK_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(AI_FEEDBACK_JSON_SCHEMA.properties.errors.items.additionalProperties).toBe(false);
  });
});
