import "server-only";

/** AI feedback is on only when explicitly enabled AND a key is configured. */
export function aiFeedbackEnabled(): boolean {
  return process.env.AI_FEEDBACK_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY);
}

export const AI_MODEL = process.env.AI_MODEL?.trim() || "claude-opus-5-5";
