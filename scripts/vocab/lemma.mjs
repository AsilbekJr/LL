// Lemmatise English text against our CEFR headwords (data/vocab/headwords.json).
// Shared by the sentence-bank scripts.
import { readFileSync } from "node:fs";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const rank = (l) => LEVELS.indexOf(l);

// ---------- lemma map ------------------------------------------------------

export const headwords = JSON.parse(readFileSync("data/vocab/headwords.json", "utf8"));
/** surface form -> { lemma, level } (lowest level wins) */
export const forms = new Map();
function addForm(form, lemma, level) {
  const cur = forms.get(form);
  if (!cur || rank(level) < rank(cur.level) || (rank(level) === rank(cur.level) && form === lemma)) {
    forms.set(form, { lemma, level });
  }
}

// Function words missing from the lists (pronouns etc.) are A1.
for (const w of `i me my mine myself you your yours yourself yourselves he him his himself she her hers herself it its
itself we us our ours ourselves they them their theirs themselves an o'clock ok okay mr mrs ms dr ought`.split(
  /\s+/,
)) {
  addForm(w, w, "A1");
}

const IRREGULAR = {
  be: "am is are was were been being",
  have: "has had having",
  do: "does did done doing",
  go: "goes went gone going",
  arise: "arose arisen",
  awake: "awoke awoken",
  bear: "bore born borne",
  beat: "beaten",
  become: "became",
  begin: "began begun",
  bend: "bent",
  bet: "bet",
  bind: "bound",
  bite: "bit bitten",
  bleed: "bled",
  blow: "blew blown",
  break: "broke broken",
  breed: "bred",
  bring: "brought",
  broadcast: "broadcast",
  build: "built",
  burn: "burnt",
  burst: "burst",
  buy: "bought",
  cast: "cast",
  catch: "caught",
  choose: "chose chosen",
  cling: "clung",
  come: "came",
  cost: "cost",
  creep: "crept",
  cut: "cut",
  deal: "dealt",
  dig: "dug",
  draw: "drew drawn",
  dream: "dreamt",
  drink: "drank drunk",
  drive: "drove driven",
  eat: "ate eaten",
  fall: "fell fallen",
  feed: "fed",
  feel: "felt",
  fight: "fought",
  find: "found",
  flee: "fled",
  fly: "flew flown flies",
  forbid: "forbade forbidden",
  forget: "forgot forgotten",
  forgive: "forgave forgiven",
  freeze: "froze frozen",
  get: "got gotten",
  give: "gave given",
  grind: "ground",
  grow: "grew grown",
  hang: "hung",
  hear: "heard",
  hide: "hid hidden",
  hit: "hit",
  hold: "held",
  hurt: "hurt",
  keep: "kept",
  kneel: "knelt",
  know: "knew known",
  lay: "laid",
  lead: "led",
  lean: "leant",
  leap: "leapt",
  learn: "learnt",
  leave: "left",
  lend: "lent",
  let: "let",
  lie: "lay lain lying",
  light: "lit",
  lose: "lost",
  make: "made",
  mean: "meant",
  meet: "met",
  mistake: "mistook mistaken",
  overcome: "overcame",
  pay: "paid",
  prove: "proven",
  put: "put",
  quit: "quit",
  read: "read",
  ride: "rode ridden",
  ring: "rang rung",
  rise: "rose risen",
  run: "ran",
  say: "said",
  see: "saw seen",
  seek: "sought",
  sell: "sold",
  send: "sent",
  set: "set",
  sew: "sewn",
  shake: "shook shaken",
  shine: "shone",
  shoot: "shot",
  show: "shown",
  shrink: "shrank shrunk",
  shut: "shut",
  sing: "sang sung",
  sink: "sank sunk",
  sit: "sat",
  sleep: "slept",
  slide: "slid",
  speak: "spoke spoken",
  speed: "sped",
  spend: "spent",
  spill: "spilt",
  spin: "spun",
  split: "split",
  spread: "spread",
  spring: "sprang sprung",
  stand: "stood",
  steal: "stole stolen",
  stick: "stuck",
  sting: "stung",
  strike: "struck",
  swear: "swore sworn",
  sweep: "swept",
  swim: "swam swum",
  swing: "swung",
  take: "took taken",
  teach: "taught",
  tear: "tore torn",
  tell: "told",
  think: "thought",
  throw: "threw thrown",
  understand: "understood",
  undertake: "undertook undertaken",
  upset: "upset",
  wake: "woke woken",
  wear: "wore worn",
  weep: "wept",
  win: "won",
  wind: "wound",
  withdraw: "withdrew withdrawn",
  write: "wrote written",
  can: "could",
  will: "would",
  shall: "should",
  may: "might",
  must: "",
  child: "children",
  man: "men",
  woman: "women",
  person: "people",
  foot: "feet",
  tooth: "teeth",
  mouse: "mice",
  wife: "wives",
  knife: "knives",
  life: "lives",
  leaf: "leaves",
  wolf: "wolves",
  half: "halves",
  shelf: "shelves",
  thief: "thieves",
  potato: "potatoes",
  tomato: "tomatoes",
  good: "better best",
  well: "better best",
  bad: "worse worst",
  badly: "worse worst",
  many: "more most",
  much: "more most",
  little: "less least",
  far: "further furthest farther farthest",
  this: "these",
  that: "those",
};

const VOWEL = /[aeiou]/;
function inflections(w) {
  const out = [
    w + "s",
    w + "es",
    w + "ed",
    w + "d",
    w + "ing",
    w + "er",
    w + "est",
    w + "r",
    w + "st",
    w + "'s",
  ];
  if (/[^aeiou]y$/.test(w)) {
    const s = w.slice(0, -1);
    out.push(s + "ies", s + "ied", s + "ier", s + "iest");
  }
  if (w.endsWith("e")) {
    const s = w.slice(0, -1);
    out.push(s + "ing", s + "er", s + "est");
  }
  if (w.endsWith("ie")) out.push(w.slice(0, -2) + "ying");
  // stop -> stopped / stopping / bigger
  if (/[^aeiou][aeiou][bdgklmnprtv]$/.test(w) && w.length <= 6) {
    const last = w.at(-1);
    out.push(w + last + "ed", w + last + "ing", w + last + "er", w + last + "est");
  }
  if (/ic$/.test(w)) out.push(w + "ked", w + "king");
  return out.filter((f) => VOWEL.test(f) || f.length > 2);
}

const multi = []; // multi-word headwords
for (const h of headwords) {
  const e = h.e.toLowerCase();
  if (/\s/.test(e)) {
    multi.push({ words: e.split(/\s+/), lemma: h.e, level: h.level });
    continue;
  }
  addForm(e, h.e, h.level);
}
for (const h of headwords) {
  const e = h.e.toLowerCase();
  if (/\s/.test(e)) continue;
  for (const f of inflections(e)) addForm(f, h.e, h.level);
  for (const f of (IRREGULAR[e] ?? "").split(" ").filter(Boolean)) addForm(f, h.e, h.level);
}

const CONTRACTIONS = {
  "can't": ["can", "not"],
  cannot: ["can", "not"],
  "won't": ["will", "not"],
  "shan't": ["shall", "not"],
  "let's": ["let", "us"],
};
const SUFFIXES = [
  ["n't", "not"],
  ["'m", "am"],
  ["'re", "are"],
  ["'ll", "will"],
  ["'ve", "have"],
  ["'d", "would"],
  ["'s", null],
];

/** Lemmatise one token; null = unknown. */
function lemmas(token) {
  if (CONTRACTIONS[token]) return CONTRACTIONS[token].map((w) => forms.get(w));
  for (const [suf, word] of SUFFIXES) {
    if (token.endsWith(suf) && token.length > suf.length) {
      const base = forms.get(token.slice(0, -suf.length));
      if (!base) return null;
      return word ? [base, forms.get(word)] : [base];
    }
  }
  const f = forms.get(token);
  return f ? [f] : null;
}

const NAMES = new Set(
  `tom mary john alice bob jack ken mike jane emily maria bill sam jim tony lucy paul peter susan
  kate nancy betty dan anna boston london paris tokyo japan america australia canada china france
  germany italy spain russia england india mexico brazil egypt sunday monday tuesday wednesday thursday
  friday saturday january february march april june july august september october november december
  english french german japanese chinese spanish italian russian american christmas`.split(/\s+/),
);

/**
 * Analyse one sentence: its level (hardest word), headwords used, whether it
 * has names. Returns { unknown: token } when a word is not in our lists.
 */
export function analyse(text) {
  const raws = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  let level = 0;
  const lemmaSeq = [];
  for (const r of raws) {
    const t = r.toLowerCase();
    if (NAMES.has(t.replace(/'s$/, "")) && /^[A-Z]/.test(r)) {
      lemmaSeq.push("#name");
      continue;
    }
    const ls = lemmas(t);
    if (!ls || ls.some((l) => !l)) {
      return { unknown: t };
    }
    for (const l of ls) {
      level = Math.max(level, rank(l.level));
      lemmaSeq.push(l.lemma.toLowerCase());
    }
  }
  const words = new Set(lemmaSeq.filter((l) => l !== "#name"));
  // multi-word headwords: consecutive lemmas
  for (const m of multi) {
    const i = lemmaSeq.indexOf(m.words[0]);
    if (i >= 0 && m.words.every((w, k) => lemmaSeq[i + k] === w)) {
      words.add(m.lemma.toLowerCase());
      level = Math.max(level, rank(m.level));
    }
  }
  return { level, len: raws.length, words, names: lemmaSeq.includes("#name") };
}
