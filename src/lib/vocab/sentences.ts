import type { CefrLevel } from "@/lib/supabase/database.types";

/**
 * Sentence banks built by scripts/vocab/sentences.mjs and translations.mjs
 * from Tatoeba (CC BY 2.0 FR), served from /public/sentences.
 */

export interface TranslationPrompt {
  english: string;
  uzbek: string;
  level: CefrLevel;
  /** Headwords used (lower case). */
  words: string[];
}

let bank: Promise<TranslationPrompt[]> | null = null;

export function loadTranslations(): Promise<TranslationPrompt[]> {
  bank ??= fetch("/sentences/translate.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ e: string; u: string; l: CefrLevel; w: string[] }[]>;
    })
    .then((rows) => rows.map((r) => ({ english: r.e, uzbek: r.u, level: r.l, words: r.w })))
    .catch((e) => {
      bank = null;
      throw e;
    });
  return bank;
}

const examples = new Map<CefrLevel, Promise<Record<string, string[]>>>();

/** Example sentences per headword of one level. */
export function loadExamples(level: CefrLevel): Promise<Record<string, string[]>> {
  let p = examples.get(level);
  if (!p) {
    p = fetch(`/sentences/${level.toLowerCase()}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Record<string, string[]>>;
      })
      .catch((e) => {
        examples.delete(level);
        throw e;
      });
    examples.set(level, p);
  }
  return p;
}

/**
 * Next translation prompt of `level`: prefer sentences that use a word from
 * the learner's library (`known`, lower-case English keys), never `avoid`.
 * Returns the library key it practises, if any.
 */
export function pickTranslation(
  prompts: TranslationPrompt[],
  level: CefrLevel,
  known: ReadonlySet<string>,
  random: () => number,
  avoid?: string,
): { prompt: TranslationPrompt; word: string | null } | null {
  const pool = prompts.filter((p) => p.level === level && p.english !== avoid);
  if (!pool.length) return null;
  const withWord = pool
    .map((p) => ({ p, hits: p.words.filter((w) => known.has(w)) }))
    .filter((x) => x.hits.length > 0);
  // Mostly library words, sometimes anything of the level (variety).
  if (withWord.length && random() < 0.8) {
    const x = withWord[Math.floor(random() * withWord.length)]!;
    return { prompt: x.p, word: x.hits[Math.floor(random() * x.hits.length)]! };
  }
  return { prompt: pool[Math.floor(random() * pool.length)]!, word: null };
}
