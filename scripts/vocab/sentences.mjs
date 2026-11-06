// Build the example-sentence bank from Tatoeba (CC BY 2.0 FR).
//
// Every English sentence is lemmatised against our CEFR headwords; sentences
// with an unknown word are dropped, the rest get a level = their hardest word.
// For each headword we keep up to 3 short sentences close to its own level.
//
// Usage (raw Tatoeba export stays outside the repo):
//   node scripts/vocab/sentences.mjs <dir with eng_sentences.tsv>
// Writes: public/sentences/{a1..c2}.json   { headword: [sentence, ...] }
//         data/vocab/sentences/candidates-{level}.txt   (to translate into Uzbek)
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { analyse, forms, headwords, LEVELS, rank } from "./lemma.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/vocab/sentences.mjs <tatoeba export dir>");
  process.exit(1);
}

const PER_WORD = 3;
const PER_LEVEL_CANDIDATES = 100;
// Translation prompts: short for low levels, no tricky grammar for A1–A2.
const MAX_LEN = [6, 7, 9, 10, 11, 11];
const HARD_GRAMMAR =
  /\b(had better|needn't|need not|ought|shall|whom|were I|(should|must|could|would|might|may|needn't) have)\b|^(Rich|Hard|Young) as\b/i;
const hash = (n) => ((n * 2654435761) % 4294967296) / 4294967296;

// ---------- read sentences -------------------------------------------------

async function* lines(file) {
  const rl = createInterface({ input: createReadStream(`${dir}/${file}`, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) yield line;
}

const seen = new Set();
const sentences = []; // { id, text, level, len, words: Set<lemma> }
const unknown = new Map();

for await (const line of lines("eng_sentences.tsv")) {
  const [id, , raw] = line.split("\t");
  const text = raw?.trim().replace(/’/g, "'");
  if (!text || !/^[A-Z][A-Za-z ,'?!.\-]+[.?!]$/.test(text)) continue;
  if (/\s{2}|--|\.\.|[,!?.][A-Za-z]/.test(text)) continue;
  const key = text.toLowerCase();
  if (seen.has(key)) continue;
  const a = analyse(text);
  if (a.unknown) {
    unknown.set(a.unknown, (unknown.get(a.unknown) ?? 0) + 1);
    continue;
  }
  if (a.len < 4 || a.len > 12) continue;
  seen.add(key);
  sentences.push({ id: Number(id), text, ...a });
}
console.log(`usable sentences: ${sentences.length}`);
console.log(
  "top unknown:",
  [...unknown.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([w, n]) => `${w}:${n}`)
    .join(" "),
);

// ---------- pick examples per headword ------------------------------------

const byWord = new Map();
for (const s of sentences) {
  for (const w of s.words) {
    let list = byWord.get(w);
    if (!list) byWord.set(w, (list = []));
    list.push(s);
  }
}

const useCount = new Map(); // spread sentences across words
const out = Object.fromEntries(LEVELS.map((l) => [l, {}]));
let covered = 0;
for (const h of headwords) {
  const key = h.e.toLowerCase();
  const wl = rank(h.level);
  const list = (byWord.get(key) ?? []).filter((s) => s.level <= Math.max(wl, 1) + 1);
  if (!list.length) continue;
  const score = (s) =>
    Math.abs(s.level - wl) * 10 +
    Math.abs(s.len - 8) +
    (s.names ? 3 : 0) +
    (useCount.get(s.id) ?? 0) * 6 +
    s.id / 1e8;
  const picked = [...list].sort((a, b) => score(a) - score(b)).slice(0, PER_WORD);
  for (const s of picked) useCount.set(s.id, (useCount.get(s.id) ?? 0) + 1);
  out[h.level][h.e] = picked.map((s) => s.text);
  covered++;
}

mkdirSync("public/sentences", { recursive: true });
let total = 0;
for (const l of LEVELS) {
  writeFileSync(`public/sentences/${l.toLowerCase()}.json`, JSON.stringify(out[l]));
  total += Object.keys(out[l]).length;
}
console.log(`examples: ${covered}/${headwords.length} headwords covered (${total})`);

// ---------- candidates for Uzbek translation --------------------------------

mkdirSync("data/vocab/sentences", { recursive: true });
for (const [li, l] of LEVELS.entries()) {
  const covers = new Set();
  const pool = sentences
    .filter(
      (s) =>
        s.level === li &&
        !s.names &&
        s.len >= 4 &&
        s.len <= MAX_LEN[li] &&
        !(li < 2 && HARD_GRAMMAR.test(s.text)),
    )
    .sort((a, b) => hash(a.id) - hash(b.id));
  const chosen = [];
  // Greedy: each new sentence should bring a word of this level we have not covered yet.
  for (const s of pool) {
    const fresh = [...s.words].filter((w) => !covers.has(w) && forms.get(w)?.level === l);
    if (!fresh.length) continue;
    fresh.forEach((w) => covers.add(w));
    chosen.push(s.text);
    if (chosen.length >= PER_LEVEL_CANDIDATES) break;
  }
  writeFileSync(`data/vocab/sentences/candidates-${l.toLowerCase()}.txt`, chosen.join("\n") + "\n");
  console.log(`candidates ${l}: ${chosen.length}`);
}
