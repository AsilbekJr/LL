/**
 * Situations for production prompts. Writing/speaking "in context" makes the
 * word usable in real life, not just recognisable.
 */
export const CONTEXTS = [
  { id: "daily", label: "Kundalik hayot", prompt: "kundalik hayotingiz haqida" },
  { id: "work", label: "Ish", prompt: "ishingiz yoki kasbingiz haqida" },
  { id: "study", label: "O'qish", prompt: "o'qishingiz haqida" },
  { id: "travel", label: "Sayohat", prompt: "sayohat haqida" },
  { id: "family", label: "Oila va do'stlar", prompt: "oilangiz yoki do'stlaringiz haqida" },
  { id: "ielts_p1", label: "IELTS Part 1", prompt: "o'zingiz haqingizda (IELTS Part 1 uslubida)" },
  { id: "ielts_p2", label: "IELTS Part 2", prompt: "biror voqeani hikoya qilib (IELTS Part 2 uslubida)" },
  { id: "opinion", label: "Fikr bildirish", prompt: "biror masala bo'yicha fikringizni bildirib" },
] as const;

export type ContextId = (typeof CONTEXTS)[number]["id"];

export function contextById(id: string) {
  return CONTEXTS.find((c) => c.id === id) ?? CONTEXTS[0];
}

/** Pick a context, avoiding the previous one when possible. */
export function pickContext(random: () => number, previous?: string) {
  const options = CONTEXTS.filter((c) => c.id !== previous);
  return options[Math.floor(random() * options.length)] ?? CONTEXTS[0];
}

/** Uzbek instruction shown above the text box. */
export function productionPrompt(term: string, contextId: string, mode: "written" | "spoken"): string {
  const c = contextById(contextId);
  return mode === "written"
    ? `“${term}” so'zini ishlatib, ${c.prompt} gap yozing.`
    : `“${term}” so'zini ishlatib, ${c.prompt} ovoz chiqarib gapiring.`;
}
