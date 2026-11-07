import type { CefrLevel } from "@/lib/supabase/database.types";
import { addDays, type IsoDate } from "@/lib/srs/dates";

/** One sentence of a text: [english, uzbek]. */
export type TextSentence = [string, string];

export interface BuiltinText {
  id: string;
  level: CefrLevel;
  title: string;
  title_uz: string;
  words: string[];
  sentences: TextSentence[];
}

export interface TextIndexEntry {
  id: string;
  level: CefrLevel;
  title: string;
  title_uz: string;
  sentences: number;
  words: number;
}

const cache = new Map<string, Promise<unknown>>();
function getJson<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T>;
      })
      .catch((e) => {
        cache.delete(url);
        throw e;
      });
    cache.set(url, p);
  }
  return p;
}

/** Built-in graded texts (public/texts, written for this app). */
export const loadTextIndex = () => getJson<TextIndexEntry[]>("/texts/index.json");
export const loadBuiltinTexts = (level: CefrLevel) =>
  getJson<BuiltinText[]>(`/texts/${level.toLowerCase()}.json`);

/**
 * Spaced repetition for whole texts: after a good practice the text comes
 * back after 1, 3, 7, 16, then every 35 days; a weak one (score < PASS)
 * comes back tomorrow without moving up.
 */
export const TEXT_INTERVALS = [1, 3, 7, 16, 35] as const;
export const TEXT_PASS = 0.6;

export function scheduleText(
  repetitions: number,
  score: number,
  today: IsoDate,
): { repetitions: number; dueDate: IsoDate } {
  if (score < TEXT_PASS) return { repetitions, dueDate: addDays(today, 1) };
  const interval = TEXT_INTERVALS[Math.min(repetitions, TEXT_INTERVALS.length - 1)]!;
  return { repetitions: repetitions + 1, dueDate: addDays(today, interval) };
}

/** Parse the jsonb `sentences` column defensively. */
export function parseSentences(value: unknown): TextSentence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) =>
    Array.isArray(s) && typeof s[0] === "string" && s[0].trim()
      ? [[s[0], typeof s[1] === "string" ? s[1] : ""] as TextSentence]
      : [],
  );
}

/** Split an English sentence into word / non-word pieces (for tap-to-translate). */
export function splitWords(sentence: string): { text: string; word: boolean }[] {
  return (sentence.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|[^A-Za-z]+/g) ?? []).map((text) => ({
    text,
    word: /^[A-Za-z]/.test(text),
  }));
}

/** Candidate dictionary headwords for an inflected word ("studies" -> study). */
export function lookupCandidates(word: string): string[] {
  const w = word.toLowerCase().replace(/’/g, "'").replace(/'s$/, "");
  const out = [w];
  const add = (x: string) => x.length > 1 && !out.includes(x) && out.push(x);
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s")) add(w.slice(0, -1));
  if (w.endsWith("ed")) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (/(.)\1ed$/.test(w)) add(w.slice(0, -3));
  }
  if (w.endsWith("ing")) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + "e");
    if (/(.)\1ing$/.test(w)) add(w.slice(0, -4));
  }
  if (w.endsWith("er")) add(w.slice(0, -2));
  if (w.endsWith("est")) add(w.slice(0, -3));
  if (w.endsWith("ly")) add(w.slice(0, -2));
  return out;
}
