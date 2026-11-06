// Merge headwords (normalize.mjs) with Uzbek translations (data/vocab/uz/*.tsv)
// into per-level files the app loads: public/vocab/{a1..c2}.json + index.json.
// Fails loudly on any missing / extra / malformed translation.
// Usage: node scripts/vocab/normalize.mjs && node scripts/vocab/build.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const headwords = JSON.parse(readFileSync("data/vocab/headwords.json", "utf8"));

const uz = new Map();
const problems = [];
for (const file of readdirSync("data/vocab/uz")
  .filter((f) => f.endsWith(".tsv"))
  .sort()) {
  readFileSync(`data/vocab/uz/${file}`, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!line.trim()) return;
      const [e, u, ...rest] = line.split("\t");
      if (!e || !u || rest.length) return problems.push(`${file}:${i + 1} malformed: ${line}`);
      // Uzbek Latin only: ASCII letters, apostrophe, basic punctuation (catches stray Cyrillic).
      if (!/^[A-Za-z0-9 '’(),;.\-/✓%]+$/.test(u)) problems.push(`${file}:${i + 1} non-Latin chars: ${u}`);
      if (uz.has(e.toLowerCase())) problems.push(`${file}:${i + 1} duplicate: ${e}`);
      uz.set(e.toLowerCase(), u.trim());
    });
}

const out = Object.fromEntries(LEVELS.map((l) => [l, []]));
for (const h of headwords) {
  const u = uz.get(h.e.toLowerCase());
  if (!u) {
    problems.push(`missing translation: ${h.e}`);
    continue;
  }
  uz.delete(h.e.toLowerCase());
  out[h.level].push({ e: h.e, u, p: h.pos.join("/") });
}
for (const extra of uz.keys()) problems.push(`translation without headword: ${extra}`);

if (problems.length) {
  console.error(problems.slice(0, 40).join("\n"));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}

mkdirSync("public/vocab", { recursive: true });
const index = [];
for (const level of LEVELS) {
  const file = `${level.toLowerCase()}.json`;
  writeFileSync(`public/vocab/${file}`, JSON.stringify(out[level]));
  index.push({ level, file, count: out[level].length });
}
writeFileSync(
  "public/vocab/index.json",
  JSON.stringify(
    {
      version: 1,
      sources: [
        "The CEFR-J Wordlist Version 1.5, compiled by Yukio Tono, Tokyo University of Foreign Studies",
        "Octanove Vocabulary Profile C1/C2 1.0 by Octanove Labs (CC BY-SA 4.0)",
      ],
      levels: index,
    },
    null,
    2,
  ),
);
console.log("ok:", index.map((i) => `${i.level} ${i.count}`).join(", "));
