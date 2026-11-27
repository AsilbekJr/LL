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
  /** Abbreviations ("IT", "TV") match only as written in capitals — "it" is not IT. */
  acronyms: Map<string, VocabEntry>;
  /** First word (any form) → phrases that start with it, longest first. */
  phrases: Map<string, VocabEntry[]>;
}

function better(a: VocabEntry | undefined, b: VocabEntry): boolean {
  return !a || levelRank(b.level) < levelRank(a.level);
}

/** Forms → dictionary entry; the most basic level wins when a form is shared. */
export function buildIndex(entries: VocabEntry[]): WordIndex {
  const single = new Map<string, VocabEntry>();
  const acronyms = new Map<string, VocabEntry>();
  const phrases = new Map<string, VocabEntry[]>();
  for (const e of entries) {
    if (/^[A-Z]{2,}s?$/.test(e.english)) {
      acronyms.set(e.english, e);
      continue;
    }
    const words = e.english.toLowerCase().split(/\s+/);
    // A phrase is vocabulary even when it works like a preposition ("because of");
    // a single word is skipped only when it is nothing but grammar ("like" is also a verb).
    const grammarOnly = e.pos.split("/").every((p) => SKIP_POS.has(p.trim()));
    if (words.length === 1 && grammarOnly) continue;
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
  return { single, acronyms, phrases };
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

const PARTICLES = new Set([
  "up",
  "down",
  "out",
  "off",
  "on",
  "in",
  "over",
  "away",
  "back",
  "around",
  "round",
  "through",
  "along",
  "about",
  "across",
  "ahead",
  "apart",
  "by",
  "forward",
  "together",
]);
const OBJECT_PRONOUNS = new Set([
  "it",
  "them",
  "him",
  "her",
  "me",
  "us",
  "you",
  "this",
  "that",
  "these",
  "those",
]);
const DETERMINERS = new Set([
  "the",
  "a",
  "an",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
  "this",
  "that",
  "these",
  "those",
  "some",
  "every",
]);

/** A separable phrasal verb: "pick up" with an object between — "pick it up", "turn the music down". */
function isSeparable(english: string, pos: string): boolean {
  const words = english.split(/\s+/);
  return words.length === 2 && pos.includes("phrasal verb") && PARTICLES.has(words[1]!.toLowerCase());
}

/**
 * Length of a short object between verb and particle: a pronoun ("it"), or a
 * determiner with one or two words ("the music", "my old car"). 0 = none.
 */
function objectLength(words: string[], from: number, particle: string): number {
  const first = words[from];
  if (!first) return 0;
  if (OBJECT_PRONOUNS.has(first) && words[from + 1] === particle) return 1;
  if (!DETERMINERS.has(first)) return 0;
  for (let n = 2; n <= 3; n++) {
    if (words[from + n] === particle && !words.slice(from + 1, from + n).some((w) => PARTICLES.has(w)))
      return n;
  }
  return 0;
}

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
      const acronym = index.acronyms.get(tok.raw);
      if (acronym) {
        hit(acronym, sentence);
        continue;
      }
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
      // Separated: "pick it up", "turn the music down".
      const words = tokens.map((t) => t.word);
      const split = index.phrases.get(tok.word)?.find((p) => {
        if (!isSeparable(p.english, p.pos)) return false;
        const particle = p.english.split(/\s+/)[1]!.toLowerCase();
        return objectLength(words, i + 1, particle) > 0;
      });
      if (split) {
        hit(split, sentence);
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

/**
 * The word in its sentence, for highlighting: [before, word, after] or null.
 * A separated phrasal verb is marked from the verb to the particle ("pick it up").
 */
export function markInSentence(sentence: string, english: string): [string, string, string] | null {
  const tokens = [...sentence.matchAll(TOKEN)];
  const parts = english.split(/\s+/);
  const n = parts.length;
  const span = (a: number, b: number): [string, string, string] => {
    const start = tokens[a]!.index!;
    const end = tokens[b]!.index! + tokens[b]![0].length;
    return [sentence.slice(0, start), sentence.slice(start, end), sentence.slice(end)];
  };
  for (let i = 0; i + n <= tokens.length; i++) {
    const chunk = tokens.slice(i, i + n);
    if (usesTerm(chunk.map((c) => c[0]).join(" "), english)) return span(i, i + n - 1);
  }
  if (n === 2 && PARTICLES.has(parts[1]!.toLowerCase())) {
    const words = tokens.map((t) => t[0].toLowerCase());
    const particle = parts[1]!.toLowerCase();
    for (let i = 0; i < tokens.length; i++) {
      if (!usesTerm(tokens[i]![0], parts[0]!)) continue;
      const gap = objectLength(words, i + 1, particle);
      if (gap) return span(i, i + gap + 1);
    }
  }
  return null;
}
