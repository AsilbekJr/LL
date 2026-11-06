import type { CefrLevel } from "@/lib/supabase/database.types";

/**
 * Built-in CEFR dictionary (public/vocab/*.json, built by scripts/vocab/build.mjs
 * from the CEFR-J Wordlist 1.5 and the Octanove C1/C2 profile, with Uzbek
 * translations). Used for typing suggestions and for importing words.
 */
export const VOCAB_LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Entry as stored in the JSON files (short keys keep the files small). */
export interface RawEntry {
  e: string;
  u: string;
  p: string;
}

export interface VocabEntry {
  english: string;
  uzbek: string;
  /** Parts of speech, e.g. "noun/verb". */
  pos: string;
  level: CefrLevel;
}

const cache = new Map<CefrLevel, Promise<VocabEntry[]>>();

export function loadLevel(level: CefrLevel): Promise<VocabEntry[]> {
  let p = cache.get(level);
  if (!p) {
    p = fetch(`/vocab/${level.toLowerCase()}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`vocab ${level}: ${r.status}`);
        return r.json() as Promise<RawEntry[]>;
      })
      .then((rows) => rows.map((r) => ({ english: r.e, uzbek: r.u, pos: r.p, level })));
    // Do not cache failures: the next call retries.
    p.catch(() => cache.delete(level));
    cache.set(level, p);
  }
  return p;
}

export async function loadAll(): Promise<VocabEntry[]> {
  return (await Promise.all(VOCAB_LEVELS.map(loadLevel))).flat();
}

// ---------- suggestions --------------------------------------------------------

const LEVEL_RANK = Object.fromEntries(VOCAB_LEVELS.map((l, i) => [l, i])) as Record<CefrLevel, number>;

/**
 * Suggestions for what the learner is typing. Ranking: exact match, then
 * words that start with the text, then phrases containing a word that starts
 * with it ("up" → "give up"); within each group easier levels and shorter
 * words first.
 */
export function suggest(query: string, entries: VocabEntry[], limit = 8): VocabEntry[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [];
  const scored: { entry: VocabEntry; score: number }[] = [];
  for (const entry of entries) {
    const e = entry.english.toLowerCase();
    let tier: number;
    if (e === q) tier = 0;
    else if (e.startsWith(q)) tier = 1;
    else if (q.length >= 2 && e.split(/[\s-]+/).some((w) => w.startsWith(q))) tier = 2;
    else continue;
    scored.push({ entry, score: tier * 1000 + LEVEL_RANK[entry.level] * 100 + Math.min(99, e.length) });
  }
  scored.sort((a, b) => a.score - b.score || a.entry.english.localeCompare(b.entry.english));
  return scored.slice(0, limit).map((s) => s.entry);
}

// ---------- browsing: sub-dictionaries -----------------------------------------

export type WordClass = "noun" | "verb" | "adjective" | "adverb" | "other";
export const WORD_CLASSES: WordClass[] = ["noun", "verb", "adjective", "adverb", "other"];

/** Main word class of an entry (its first listed part of speech). */
export function wordClass(pos: string): WordClass {
  const first = pos.split("/")[0]?.trim() ?? "";
  return first === "noun" || first === "verb" || first === "adjective" || first === "adverb"
    ? first
    : "other";
}

export interface SubDictionary {
  id: string;
  level: CefrLevel;
  wordClass: WordClass;
  /** 1-based number within level + class. */
  part: number;
  parts: number;
  /** First and last word, for the card label ("ability – crowd"). */
  from: string;
  to: string;
  entries: VocabEntry[];
}

export const SUBDICT_SIZE = 60;

/**
 * Split one level into many small dictionaries: by word class, then
 * alphabetically into chunks of about SUBDICT_SIZE words.
 */
export function subDictionaries(
  level: CefrLevel,
  entries: VocabEntry[],
  size = SUBDICT_SIZE,
): SubDictionary[] {
  const out: SubDictionary[] = [];
  for (const wc of WORD_CLASSES) {
    const words = entries
      .filter((e) => e.level === level && wordClass(e.pos) === wc)
      .sort((a, b) => a.english.localeCompare(b.english, "en", { sensitivity: "base" }));
    if (!words.length) continue;
    // Even chunks (e.g. 130 → 65 + 65, not 60 + 60 + 10).
    const parts = Math.max(1, Math.round(words.length / size));
    const per = Math.ceil(words.length / parts);
    for (let i = 0; i < parts; i++) {
      const chunk = words.slice(i * per, (i + 1) * per);
      if (!chunk.length) continue;
      out.push({
        id: `${level}-${wc}-${i + 1}`,
        level,
        wordClass: wc,
        part: i + 1,
        parts,
        from: chunk[0]!.english,
        to: chunk.at(-1)!.english,
        entries: chunk,
      });
    }
  }
  return out;
}
