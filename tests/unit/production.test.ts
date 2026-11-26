import { describe, expect, it } from "vitest";
import { contextById, pickContext, productionPrompt } from "@/lib/production/contexts";
import {
  aiFeedbackRequestSchema,
  aiFeedbackSchema,
  AI_FEEDBACK_JSON_SCHEMA,
} from "@/lib/production/feedback";

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
