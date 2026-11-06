import { z } from "zod";

/** Structured AI feedback on one learner sentence (shared by the API route and the UI). */
export const aiFeedbackSchema = z.object({
  word_used_correctly: z.boolean(),
  natural: z.boolean(),
  errors: z
    .array(
      z.object({
        fragment: z.string(),
        correction: z.string(),
        explanation_uz: z.string(),
      }),
    )
    .max(8),
  corrected: z.string(),
  tip_uz: z.string(),
});

export type AiFeedback = z.infer<typeof aiFeedbackSchema>;

/** JSON Schema sent to the model as the required output format. */
export const AI_FEEDBACK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["word_used_correctly", "natural", "errors", "corrected", "tip_uz"],
  properties: {
    word_used_correctly: {
      type: "boolean",
      description: "True if the target word/phrase is used with the right meaning and grammar.",
    },
    natural: { type: "boolean", description: "True if a native speaker would say it this way." },
    errors: {
      type: "array",
      description: "Concrete mistakes, at most 8. Empty if there are none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fragment", "correction", "explanation_uz"],
        properties: {
          fragment: { type: "string", description: "The wrong part, copied from the learner's text." },
          correction: { type: "string", description: "The corrected part." },
          explanation_uz: { type: "string", description: "One short sentence in Uzbek (Latin script)." },
        },
      },
    },
    corrected: {
      type: "string",
      description:
        "The learner's text with minimal corrections. Same as the input if it was already correct.",
    },
    tip_uz: {
      type: "string",
      description: "One short, encouraging tip in Uzbek (Latin script) about using the target word.",
    },
  },
} as const;

export const aiFeedbackRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  english: z.string().trim().min(1).max(500),
  uzbek: z.string().trim().max(500).optional(),
  context: z.string().max(40).optional(),
  mode: z.enum(["written", "spoken"]),
});

export type AiFeedbackRequest = z.infer<typeof aiFeedbackRequestSchema>;
