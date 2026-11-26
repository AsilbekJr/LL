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
