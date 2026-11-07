// Validate the graded reading texts (data/texts/{a1..c2}.json) and publish them
// to public/texts/. Every sentence is lemmatised against the CEFR word lists:
// the report shows how many words sit above the text's level ("stretch" words)
// and words that are in no list (names are ignored when capitalised).
// Usage: node scripts/texts/build.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { forms, LEVELS, rank } from "../vocab/lemma.mjs";

const problems = [];
const index = [];
mkdirSync("public/texts", { recursive: true });

function lemmaOf(token) {
  const t = token.toLowerCase().replace(/'s$/, "");
  return forms.get(t) ?? forms.get(t.replace(/n't$/, "")) ?? null;
}

for (const level of LEVELS) {
  const file = `data/texts/${level.toLowerCase()}.json`;
  if (!existsSync(file)) continue;
  const texts = JSON.parse(readFileSync(file, "utf8"));
  const out = [];
  for (const t of texts) {
    const where = `${file} ${t.id}`;
    if (!t.id?.startsWith(level.toLowerCase() + "-"))
      problems.push(`${where}: id must start with ${level.toLowerCase()}-`);
    if (!t.title || !t.title_uz) problems.push(`${where}: title missing`);
    if (!Array.isArray(t.sentences) || t.sentences.length < 5)
      problems.push(`${where}: needs >= 5 sentences`);
    if (!Array.isArray(t.words) || t.words.length < 4) problems.push(`${where}: needs >= 4 key words`);

    const lemmas = new Set();
    const above = new Map();
    const unknown = new Set();
    let tokens = 0;
    for (const [en, uzText] of t.sentences) {
      if (!en?.trim() || !uzText?.trim()) problems.push(`${where}: empty sentence pair`);
      if (/[А-Яа-яЁё]/.test(uzText)) problems.push(`${where}: Cyrillic in "${uzText}"`);
      const raw = en.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
      raw.forEach((r, i) => {
        tokens++;
        const f = lemmaOf(r);
        if (!f) {
          if (!(/^[A-Z]/.test(r) && i > 0) && !/^[A-Z][a-z]+$/.test(r)) unknown.add(r.toLowerCase());
          else if (!/^[A-Z]/.test(r)) unknown.add(r.toLowerCase());
          return;
        }
        lemmas.add(f.lemma.toLowerCase());
        if (rank(f.level) > rank(level)) above.set(f.lemma, f.level);
      });
    }
    const body = t.sentences
      .map(([en]) => en)
      .join(" ")
      .toLowerCase();
    for (const w of t.words) {
      const first = w.toLowerCase().split(" ")[0];
      if (!body.includes(first) && !lemmas.has(w.toLowerCase()) && !lemmas.has(first))
        problems.push(`${where}: key word "${w}" not in text`);
    }
    const stretch = above.size / Math.max(1, tokens);
    console.log(
      `${t.id.padEnd(28)} ${String(tokens).padStart(4)} words, above ${level}: ${above.size} (${(stretch * 100).toFixed(1)}%)` +
        (above.size ? ` [${[...above].map(([w, l]) => `${w}:${l}`).join(", ")}]` : "") +
        (unknown.size ? `  unknown: ${[...unknown].join(", ")}` : ""),
    );
    out.push({
      id: t.id,
      level,
      title: t.title,
      title_uz: t.title_uz,
      words: t.words,
      sentences: t.sentences,
    });
    index.push({
      id: t.id,
      level,
      title: t.title,
      title_uz: t.title_uz,
      sentences: t.sentences.length,
      words: tokens,
    });
  }
  writeFileSync(`public/texts/${level.toLowerCase()}.json`, JSON.stringify(out));
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
writeFileSync("public/texts/index.json", JSON.stringify(index));
console.log(`ok: ${index.length} texts`);
