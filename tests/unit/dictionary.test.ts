import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SUBDICT_SIZE,
  subDictionaries,
  suggest,
  VOCAB_LEVELS,
  wordClass,
  type RawEntry,
  type VocabEntry,
} from "@/lib/vocab/dictionary";
import { itemInputSchema } from "@/lib/schemas/item";

const dir = join(process.cwd(), "public", "vocab");
const all: VocabEntry[] = VOCAB_LEVELS.flatMap((level) =>
  (JSON.parse(readFileSync(join(dir, `${level.toLowerCase()}.json`), "utf-8")) as RawEntry[]).map((r) => ({
    english: r.e,
    uzbek: r.u,
    pos: r.p,
    level,
  })),
);

describe("shipped dictionary", () => {
  it("has thousands of words on every level, all translated", () => {
    expect(all.length).toBeGreaterThan(8000);
    for (const level of VOCAB_LEVELS)
      expect(all.filter((e) => e.level === level).length).toBeGreaterThan(800);
    expect(all.every((e) => e.english.trim() && e.uzbek.trim())).toBe(true);
  });

  it("every entry is a valid library item", () => {
    for (const e of all) {
      expect(
        itemInputSchema.safeParse({ english: e.english, uzbek: e.uzbek, cefr_level: e.level }).success,
      ).toBe(true);
    }
  });

  it("has no duplicate headwords across levels", () => {
    const keys = all.map((e) => e.english.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("suggest", () => {
  it("ranks exact, then prefix (easier levels first), then inner words", () => {
    const s = suggest("book", all).map((e) => e.english);
    expect(s[0]).toBe("book");
    expect(s).toEqual(expect.arrayContaining(["bookstore"]));
    expect(suggest("BOOK", all)[0]?.english).toBe("book");
  });

  it("finds phrases by an inner word", () => {
    expect(suggest("lost", all).map((e) => e.english)).toEqual(expect.arrayContaining(["lost"]));
    expect(suggest("cream", all).map((e) => e.english)).toEqual(expect.arrayContaining(["ice cream"]));
  });

  it("limits results and ignores empty input", () => {
    expect(suggest("a", all, 5)).toHaveLength(5);
    expect(suggest("   ", all)).toEqual([]);
    expect(suggest("zzzzqqq", all)).toEqual([]);
  });

  it("prefers easier levels among prefix matches", () => {
    const s = suggest("ab", all, 20);
    const levels = s.filter((e) => e.english.startsWith("ab")).map((e) => VOCAB_LEVELS.indexOf(e.level));
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });
});

describe("sub-dictionaries", () => {
  it("classifies words", () => {
    expect(wordClass("noun/verb")).toBe("noun");
    expect(wordClass("verb")).toBe("verb");
    expect(wordClass("determiner/pronoun")).toBe("other");
  });

  it("splits a level into many even, alphabetical dictionaries covering every word once", () => {
    for (const level of VOCAB_LEVELS) {
      const subs = subDictionaries(level, all);
      const words = subs.flatMap((s) => s.entries.map((e) => e.english));
      expect(words.length).toBe(all.filter((e) => e.level === level).length);
      expect(new Set(words).size).toBe(words.length);
      expect(subs.length).toBeGreaterThan(10);
      for (const s of subs) expect(s.entries.length).toBeLessThanOrEqual(Math.ceil(SUBDICT_SIZE * 1.5));
    }
    const first = subDictionaries("A1", all)[0]!;
    expect(first).toMatchObject({ level: "A1", part: 1 });
    expect(first.from <= first.to).toBe(true);
  });
});
