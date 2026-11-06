import "server-only";

export type AiProvider = "gemini" | "anthropic";

/**
 * Which AI provider checks learner sentences. `AI_PROVIDER` picks one
 * explicitly; otherwise Gemini when its key is set, else Anthropic.
 */
export function aiProvider(): AiProvider | null {
  const wanted = process.env.AI_PROVIDER?.trim().toLowerCase();
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (wanted === "gemini") return hasGemini ? "gemini" : null;
  if (wanted === "anthropic") return hasAnthropic ? "anthropic" : null;
  if (hasGemini) return "gemini";
  if (hasAnthropic) return "anthropic";
  return null;
}

/** AI feedback is on only when explicitly enabled AND a provider key is configured. */
export function aiFeedbackEnabled(): boolean {
  return process.env.AI_FEEDBACK_ENABLED === "true" && aiProvider() !== null;
}

/** Model per provider; `AI_MODEL` overrides. Gemini 3.5 Flash-Lite is on the free tier. */
export function aiModel(provider: AiProvider): string {
  const override = process.env.AI_MODEL?.trim();
  if (override) return override;
  return provider === "gemini" ? "gemini-3.5-flash-lite" : "claude-opus-5-5";
}
