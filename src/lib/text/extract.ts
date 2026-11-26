import type { CefrLevel } from "@/lib/supabase/database.types";
import type { VocabEntry } from "@/lib/vocab/dictionary";
import { usesTerm, wordForms } from "./usage";

/**
 * "Matndan so'z qo'shish": find the dictionary words in a pasted text, at
 * the learner's level, with the sentence each one was met in. Offline and
 * instant: the CEFR dictionary + inflected forms (went → go, washed → wash),
 * phrases first ("because of" before "because").
 */

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const levelRank = (l: CefrLevel) => LEVELS.indexOf(l);

/** Grammar words are not vocabulary to learn here. */
const SKIP_POS = new Set([
  "preposition",
  "pronoun",
  "determiner",
  "number",
  "conjunction",
  "modal auxiliary",
  "be-verb",
  "do-verb",
  "have-verb",
  "infinitive-to",
  "interjection",
]);

export const MAX_TEXT_CHARS = 20_000;
const MAX_SENTENCE_CHARS = 300;

export interface TextWord {
  entry: VocabEntry;
  /** How many times the word appears in the text. */
  count: number;
  /** The first sentence it appears in (becomes the word's example). */
  sentence: string;
  /** Position of the first appearance (for a stable order). */
  first: number;
}

export interface WordIndex {
  single: Map<string, VocabEntry>;
  /** First word (any form) → phrases that start with it, longest first. */
  phrases: Map<string, VocabEntry[]>;
}

function better(a: VocabEntry | undefined, b: VocabEntry): boolean {
  return !a || levelRank(b.level) < levelRank(a.level);
}

/** Forms → dictionary entry; the most basic level wins when a form is shared. */
export function buildIndex(entries: VocabEntry[]): WordIndex {
  const single = new Map<string, VocabEntry>();
  const phrases = new Map<string, VocabEntry[]>();
  for (const e of entries) {
    const words = e.english.toLowerCase().split(/\s+/);
    // A phrase is vocabulary even when it works like a preposition ("because of").
    const pos = e.pos.split("/")[0]?.trim() ?? "";
    if (words.length === 1 && SKIP_POS.has(pos)) continue;
    if (words.length === 1) {
      for (const f of wordForms(words[0]!)) if (better(single.get(f), e)) single.set(f, e);
    } else {
      for (const f of wordForms(words[0]!)) {
        const list = phrases.get(f) ?? [];
        list.push(e);
        phrases.set(f, list);
      }
    }
  }
  for (const list of phrases.values())
    list.sort((a, b) => b.english.split(" ").length - a.english.split(" ").length);
  return { single, phrases };
}

/** Sentences of a text (also split at line breaks), trimmed. */
export function splitSentences(text: string): string[] {
  return text
    .slice(0, MAX_TEXT_CHARS)
    .replace(/[‘’]/g, "'")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const TOKEN = /[A-Za-z][A-Za-z'-]*/g;

export function extractWords(text: string, index: WordIndex): TextWord[] {
  const found = new Map<string, TextWord>();
  let position = 0;
  const hit = (entry: VocabEntry, sentence: string) => {
    const key = entry.english.toLowerCase();
    const w = found.get(key);
    if (w) w.count++;
    else
      found.set(key, {
        entry,
        count: 1,
        sentence:
          sentence.length > MAX_SENTENCE_CHARS ? `${sentence.slice(0, MAX_SENTENCE_CHARS - 1)}…` : sentence,
        first: position,
      });
    position++;
  };

  for (const sentence of splitSentences(text)) {
    const tokens = [...sentence.matchAll(TOKEN)].map((m, i) => ({
      raw: m[0],
      // "John's" → "john", "don't" stays (not in the dictionary anyway).
      word: m[0].toLowerCase().replace(/'s$/, ""),
      // A capital in the middle of a sentence is a name, not vocabulary ("I" aside).
      name: i > 0 && /^[A-Z]/.test(m[0]) && m[0] !== "I",
    }));
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]!;
      if (tok.name) continue;
      // Phrases first: "because of", "pick up", "check-in desk".
      const phrase = index.phrases.get(tok.word)?.find((p) => {
        const n = p.english.split(/\s+/).length;
        const chunk = tokens.slice(i, i + n);
        return chunk.length === n && usesTerm(chunk.map((c) => c.raw).join(" "), p.english);
      });
      if (phrase) {
        hit(phrase, sentence);
        i += phrase.english.split(/\s+/).length - 1;
        continue;
      }
      const entry = index.single.get(tok.word);
      if (entry) hit(entry, sentence);
    }
  }
  return [...found.values()];
}

/**
 * Words worth suggesting at a level: that level and one above (a small
 * stretch), optionally the easier ones too. Most frequent in the text
 * first, then in reading order.
 */
export function wordsForLevel(words: TextWord[], level: CefrLevel, withEasier = false): TextWord[] {
  const sel = levelRank(level);
  return words
    .filter((w) => {
      const r = levelRank(w.entry.level);
      return r <= sel + 1 && (withEasier || r >= sel);
    })
    .sort((a, b) => b.count - a.count || a.first - b.first);
}

/** The word in its sentence, for highlighting: [before, word, after] or null. */
export function markInSentence(sentence: string, english: string): [string, string, string] | null {
  const tokens = [...sentence.matchAll(TOKEN)];
  const n = english.split(/\s+/).length;
  for (let i = 0; i + n <= tokens.length; i++) {
    const chunk = tokens.slice(i, i + n);
    if (usesTerm(chunk.map((c) => c[0]).join(" "), english)) {
      const start = chunk[0]!.index!;
      const last = chunk[chunk.length - 1]!;
      const end = last.index! + last[0].length;
      return [sentence.slice(0, start), sentence.slice(start, end), sentence.slice(end)];
    }
  }
  return null;
}
