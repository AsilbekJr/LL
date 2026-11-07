import { usesTerm, wordTokens } from "@/lib/text/usage";

export const RETELL_MIN_WORDS = 25;

/**
 * Retelling score: share of key words used, scaled down when the retelling is
 * shorter than RETELL_MIN_WORDS (saying only the key words is not a retelling).
 */
export function retellScore(said: string, keyWords: string[]) {
  const used = keyWords.filter((w) => usesTerm(said, w)).length;
  const words = wordTokens(said).length;
  const coverage = keyWords.length ? used / keyWords.length : 1;
  const length = Math.min(1, words / RETELL_MIN_WORDS);
  return { used, words, tooShort: words < RETELL_MIN_WORDS, score: words ? coverage * length : 0 };
}
