// Normalize the CEFR source CSVs into one headword list (lowest level wins).
// Usage: node scripts/vocab/normalize.mjs  → data/vocab/headwords.json
import { readFileSync, writeFileSync } from "node:fs";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    // Simple CSV with optional quoted fields.
    const cells = [];
    let cur = "",
      q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    rows.push(cells);
  }
  return rows;
}

const entries = new Map(); // key: lower-case headword
function add(rawHead, pos, level) {
  if (!LEVELS.includes(level)) return;
  // "a.m./A.M./am/AM" → "a.m."; keep the first spelling.
  const e = rawHead.split("/")[0].trim();
  // Skip contraction fragments such as 'm, 're, 's — not learnable on their own.
  if (!e || e.startsWith("'")) return;
  const key = e.toLowerCase();
  const prev = entries.get(key);
  if (!prev) entries.set(key, { e, level, pos: pos ? [pos.trim()] : [] });
  else {
    if (LEVELS.indexOf(level) < LEVELS.indexOf(prev.level)) prev.level = level;
    if (pos && !prev.pos.includes(pos.trim())) prev.pos.push(pos.trim());
  }
}

for (const [h, pos, lvl] of parseCsv(
  readFileSync("data/vocab/source/cefrj-vocabulary-profile-1.5.csv", "utf8"),
))
  add(h, pos, lvl);
for (const [h, pos, lvl] of parseCsv(
  readFileSync("data/vocab/source/octanove-vocabulary-profile-c1c2-1.0.csv", "utf8"),
))
  add(h, pos, lvl);

const list = [...entries.values()].sort(
  (a, b) =>
    LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) ||
    a.e.localeCompare(b.e, "en", { sensitivity: "base" }),
);
writeFileSync("data/vocab/headwords.json", JSON.stringify(list));
const counts = Object.fromEntries(LEVELS.map((l) => [l, list.filter((x) => x.level === l).length]));
console.log("headwords:", list.length, counts);
