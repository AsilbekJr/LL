/**
 * "Did the learner actually use the word?" — for written/spoken production.
 * Accepts regular inflections (s/es/ies, ed/d/ied, ing, doubled consonant),
 * common irregular verbs, possessives, and placeholder words in phrases
 * ("take something with a grain of salt" matches "take his advice with a grain of salt").
 */

const IRREGULAR: Record<string, string[]> = {
  be: ["am", "is", "are", "was", "were", "been", "being", "'m", "'re", "'s"],
  have: ["has", "had", "having", "'ve", "'d"],
  do: ["does", "did", "done", "doing"],
  go: ["goes", "went", "gone", "going"],
  get: ["got", "gotten", "getting"],
  take: ["took", "taken"],
  come: ["came"],
  make: ["made"],
  give: ["gave", "given"],
  break: ["broke", "broken"],
  hold: ["held"],
  lend: ["lent"],
  buy: ["bought"],
  bring: ["brought"],
  think: ["thought"],
  find: ["found"],
  keep: ["kept"],
  leave: ["left"],
  tell: ["told"],
  say: ["said"],
  see: ["saw", "seen"],
  know: ["knew", "known"],
  run: ["ran"],
  write: ["wrote", "written"],
  speak: ["spoke", "spoken"],
  draw: ["drew", "drawn"],
  fall: ["fell", "fallen"],
  feel: ["felt"],
  pay: ["paid"],
  meet: ["met"],
  lose: ["lost"],
  spend: ["spent"],
  send: ["sent"],
  build: ["built"],
  teach: ["taught"],
  catch: ["caught"],
  fight: ["fought"],
  sell: ["sold"],
  stand: ["stood"],
  understand: ["understood"],
  win: ["won"],
  eat: ["ate", "eaten"],
  drink: ["drank", "drunk"],
  begin: ["began", "begun"],
  choose: ["chose", "chosen"],
  forget: ["forgot", "forgotten"],
  wake: ["woke", "woken"],
  wear: ["wore", "worn"],
  shed: ["shed"],
  put: ["put"],
  set: ["set"],
  cut: ["cut"],
  hit: ["hit"],
  let: ["let"],
  read: ["read"],
};

/** Words in a phrase that stand for "any short noun phrase". */
const PLACEHOLDERS = new Set(["something", "someone", "somebody", "sth", "sb", "smth", "one's", "oneself"]);
const VOWELS = /[aeiou]/;

/** Normalize text to lower-case word tokens (apostrophes unified, punctuation dropped). */
export function wordTokens(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/[ʻʼ‘’`´]/g, "'")
      .match(/[a-z]+(?:['-][a-z]+)*/g) ?? []
  );
}

/** All surface forms of one English word. */
export function wordForms(word: string): Set<string> {
  const w = word.toLowerCase();
  const out = new Set([w]);
  for (const f of IRREGULAR[w] ?? []) out.add(f);

  const last = w.at(-1) ?? "";
  const beforeLast = w.at(-2) ?? "";
  // plural / 3rd person
  if (/(s|x|z|ch|sh)$/.test(w)) out.add(`${w}es`);
  else if (last === "y" && !VOWELS.test(beforeLast)) out.add(`${w.slice(0, -1)}ies`);
  else out.add(`${w}s`);
  // past / participle
  if (last === "e") out.add(`${w}d`);
  else if (last === "y" && !VOWELS.test(beforeLast)) out.add(`${w.slice(0, -1)}ied`);
  else out.add(`${w}ed`);
  // -ing
  if (w.endsWith("ie")) out.add(`${w.slice(0, -2)}ying`);
  else if (last === "e" && w.length > 2 && !w.endsWith("ee")) out.add(`${w.slice(0, -1)}ing`);
  else out.add(`${w}ing`);
  // doubled final consonant: stop → stopped/stopping (short CVC words)
  if (w.length <= 5 && /[^aeiou][aeiou][bdgklmnprt]$/.test(w)) {
    out.add(`${w}${last}ed`);
    out.add(`${w}${last}ing`);
  }
  // comparatives for short adjectives
  out.add(`${w}er`);
  out.add(`${w}est`);
  // possessive
  out.add(`${w}'s`);
  return out;
}

function matchesAt(tokens: string[], start: number, pattern: (Set<string> | "gap")[]): boolean {
  let i = start;
  for (let p = 0; p < pattern.length; p++) {
    const part = pattern[p]!;
    if (part === "gap") {
      // A placeholder: 1–4 words, then the rest of the pattern must match.
      for (let skip = 1; skip <= 4 && i + skip <= tokens.length; skip++) {
        if (matchesAt(tokens, i + skip, pattern.slice(p + 1))) return true;
      }
      return false;
    }
    if (i >= tokens.length || !part.has(tokens[i]!)) return false;
    i++;
  }
  return true;
}

/** Does `text` contain `target` (a word or phrase), allowing inflection and placeholders? */
export function usesTerm(text: string, target: string): boolean {
  const words = wordTokens(target.replace(/\([^)]*\)/g, " "));
  // "to give up" → "give up"; a lone "to" stays.
  const core = words.length > 1 && words[0] === "to" ? words.slice(1) : words;
  if (!core.length) return false;
  const pattern: (Set<string> | "gap")[] = core.map((w) => (PLACEHOLDERS.has(w) ? "gap" : wordForms(w)));
  // Placeholders at the ends add nothing.
  while (pattern[0] === "gap") pattern.shift();
  while (pattern.at(-1) === "gap") pattern.pop();
  if (!pattern.length) return false;

  const tokens = wordTokens(text);
  for (let i = 0; i < tokens.length; i++) if (matchesAt(tokens, i, pattern)) return true;
  return false;
}

const CONTRACTIONS: Record<string, string> = {
  "can't": "can not",
  cannot: "can not",
  "won't": "will not",
  "shan't": "shall not",
  "let's": "let us",
  "ain't": "is not",
};
const SUFFIX_EXPANSIONS: [string, string][] = [
  ["n't", " not"],
  ["'m", " am"],
  ["'re", " are"],
  ["'ve", " have"],
  ["'ll", " will"],
  ["'d", " would"],
];
/** "it's" / "what's" / "there's" … ("Tom's car" stays possessive). */
const IS_CONTRACTIONS = new Set([
  "it's",
  "that's",
  "what's",
  "there's",
  "here's",
  "he's",
  "she's",
  "who's",
  "where's",
  "how's",
]);

/**
 * Word tokens with contractions spelled out ("I'm" → "i am", "can't" → "can not"),
 * so "I am not" and "I'm not" compare as equal. Speech recognisers pick
 * either form at random.
 */
export function expandedTokens(text: string): string[] {
  const out: string[] = [];
  for (const t of wordTokens(text)) {
    const whole = CONTRACTIONS[t] ?? (IS_CONTRACTIONS.has(t) ? `${t.slice(0, -2)} is` : null);
    if (whole) {
      out.push(...whole.split(" "));
      continue;
    }
    const suf = SUFFIX_EXPANSIONS.find(([s]) => t.endsWith(s) && t.length > s.length);
    if (suf) out.push(...(t.slice(0, -suf[0].length) + suf[1]).split(" "));
    else out.push(t);
  }
  return out;
}

/** Word-level similarity 0..1 (1 − normalized word edit distance), for shadowing. */
export function wordSimilarity(said: string, expected: string): number {
  const a = expandedTokens(said);
  const b = expandedTokens(expected);
  if (!b.length) return a.length ? 0 : 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.max(0, 1 - prev[b.length]! / Math.max(a.length, b.length));
}

export const MIN_PRODUCTION_WORDS = 4;

export interface ProductionCheck {
  used: boolean;
  wordCount: number;
  longEnough: boolean;
  passed: boolean;
}

/** A production passes when it uses the term in a sentence of at least 4 words. */
export function checkProduction(text: string, target: string): ProductionCheck {
  const wordCount = wordTokens(text).length;
  const used = usesTerm(text, target);
  const longEnough = wordCount >= MIN_PRODUCTION_WORDS;
  return { used, wordCount, longEnough, passed: used && longEnough };
}
