// Build the Uzbek -> English speaking-translation bank from
// data/vocab/sentences/uz/{a1..c2}.tsv ("english<TAB>uzbek").
// Each sentence gets its CEFR level and the headwords it uses, so the app can
// prefer sentences with words from the learner's library.
// Usage: node scripts/vocab/translations.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { analyse, LEVELS } from "./lemma.mjs";

const out = [];
const problems = [];
const seen = new Set();
for (const level of LEVELS) {
  const file = `data/vocab/sentences/uz/${level.toLowerCase()}.tsv`;
  if (!existsSync(file)) continue;
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      if (!line.trim()) return;
      const [e, u, ...rest] = line.split("\t");
      const where = `${file}:${i + 1}`;
      if (!e || !u || rest.length) return problems.push(`${where} malformed`);
      if (!/^[A-Za-z0-9 '’(),;.!?\-—:]+$/.test(u)) problems.push(`${where} non-Latin chars: ${u}`);
      if (seen.has(e)) problems.push(`${where} duplicate: ${e}`);
      seen.add(e);
      const a = analyse(e);
      if (a.unknown) return problems.push(`${where} unknown word "${a.unknown}"`);
      out.push({ e, u: u.trim(), l: LEVELS[a.level], w: [...a.words] });
    });
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
writeFileSync("public/sentences/translate.json", JSON.stringify(out));
const by = Object.fromEntries(LEVELS.map((l) => [l, out.filter((s) => s.l === l).length]));
console.log(`translate bank: ${out.length}`, by);
