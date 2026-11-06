/**
 * Checking typed answers. Lenient about things that are not the point of
 * the exercise (case, extra spaces, end punctuation, apostrophe style,
 * a leading "to " on verbs) and strict about the word itself.
 */

/** Normalize for comparison. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[ʻʼ‘’`´]/g, "'") // o‘ / oʻ / o' → o'
    .replace(/[“”«»"]/g, "")
    .replace(/[.,!?;:…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "to give up" and "give up" are the same answer. */
function stripTo(s: string): string {
  return s.startsWith("to ") ? s.slice(3) : s;
}

/**
 * All acceptable forms of an expected answer: "yuk, bagaj" → ["yuk, bagaj", "yuk", "bagaj"];
 * parenthesised hints are optional: "och (qorni och)" → ["och (qorni och)", "och"].
 */
export function acceptableAnswers(expected: string): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    const n = stripTo(normalizeAnswer(s));
    if (n) out.add(n);
  };
  add(expected);
  const noParens = expected.replace(/\([^)]*\)/g, " ");
  add(noParens);
  for (const part of noParens.split(/[,;/]/)) add(part);
  return [...out];
}

/** Levenshtein edit distance (two-row DP). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

export type TypedVerdict = "correct" | "typo" | "wrong";

export interface TypedCheck {
  verdict: TypedVerdict;
  /** The acceptable form closest to what was typed. */
  closest: string;
  distance: number;
}

/** Allowed typos: none for short words, then roughly one per 6 letters (max 2). */
export function typoAllowance(length: number): number {
  if (length <= 4) return 0;
  return Math.min(2, Math.floor(length / 6) + 1);
}

export function checkTyped(answer: string, expected: string): TypedCheck {
  const typed = stripTo(normalizeAnswer(answer));
  let best: TypedCheck = { verdict: "wrong", closest: expected, distance: Number.POSITIVE_INFINITY };
  for (const form of acceptableAnswers(expected)) {
    const d = levenshtein(typed, form);
    if (d < best.distance) best = { verdict: "wrong", closest: form, distance: d };
  }
  if (!typed) return { ...best, verdict: "wrong" };
  if (best.distance === 0) return { ...best, verdict: "correct" };
  if (best.distance <= typoAllowance(best.closest.length)) return { ...best, verdict: "typo" };
  return best;
}

/** Word tokens of a sentence for word-order exercises (punctuation stays on its word). */
export function sentenceTokens(sentence: string): string[] {
  return sentence.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

/**
 * Cloze: blank out `term` inside `sentence` (case-insensitive, whole words).
 * Returns null when the term does not occur as written.
 */
export function makeCloze(
  sentence: string,
  term: string,
): { before: string; answer: string; after: string } | null {
  const t = term.trim().replace(/^to /i, "");
  if (!t) return null;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const m = new RegExp(`(^|[^\\p{L}'])(${escaped})(?=$|[^\\p{L}'])`, "iu").exec(sentence);
  if (!m) return null;
  const start = m.index + m[1]!.length;
  return { before: sentence.slice(0, start), answer: m[2]!, after: sentence.slice(start + m[2]!.length) };
}

/** Cloze for a sentence item: hide its longest word. */
export function clozeLongestWord(sentence: string): { before: string; answer: string; after: string } | null {
  const words = sentence.match(/\p{L}[\p{L}'-]*/gu) ?? [];
  const longest = words.reduce<string>((a, w) => (w.length > a.length ? w : a), "");
  return longest.length >= 3 ? makeCloze(sentence, longest) : null;
}
