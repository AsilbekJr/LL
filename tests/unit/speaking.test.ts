import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVE_DAYS, activeCount, spokenDays } from "@/lib/production/active";
import { checkPattern, fitsSlot, hasKey, PATTERNS, pickPattern } from "@/lib/production/patterns";
import { expandedTokens, wordSimilarity } from "@/lib/text/usage";
import { pickTranslation, type TranslationPrompt } from "@/lib/vocab/sentences";

const byId = (id: string) => PATTERNS.find((p) => p.id === id)!;

describe("expandedTokens", () => {
  it("spells out contractions", () => {
    expect(expandedTokens("I'm sure it's fine, but I can't go.")).toEqual(
      "i am sure it is fine but i can not go".split(" "),
    );
    expect(expandedTokens("We've been here; they'd rather not.")).toEqual(
      "we have been here they would rather not".split(" "),
    );
    expect(expandedTokens("Tom's car")).toEqual(["tom's", "car"]);
  });

  it("makes similarity contraction-blind", () => {
    expect(wordSimilarity("I am not ready", "I'm not ready")).toBe(1);
  });
});

describe("patterns", () => {
  it("has 10 patterns per level with unique ids and a slot marker or key", () => {
    const ids = new Set(PATTERNS.map((p) => p.id));
    expect(ids.size).toBe(PATTERNS.length);
    for (const l of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
      expect(PATTERNS.filter((p) => p.level === l)).toHaveLength(10);
    }
    // Every example satisfies its own keys.
    for (const p of PATTERNS) {
      for (const k of p.keys) expect(hasKey(p.example, k), `${p.id}: ${k}`).toBe(true);
    }
  });

  it("checks frame, word and length", () => {
    const p = byId("a2-going-to");
    expect(checkPattern("I'm going to visit Samarkand this weekend", p, "visit").passed).toBe(true);
    expect(checkPattern("I am going to visit Samarkand this weekend", p, "visit").passed).toBe(true);
    const miss = checkPattern("I will visit Samarkand this weekend", p, "visit");
    expect(miss.passed).toBe(false);
    expect(miss.keys).toEqual([false, true]);
    expect(checkPattern("I'm going to sleep this weekend", p, "visit").used).toBe(false);
  });

  it("accepts key alternatives and inflected targets", () => {
    expect(checkPattern("My favourite fruit is apple", byId("a1-favorite"), "fruit").passed).toBe(true);
    expect(checkPattern("I've been working here since May", byId("b1-been-for"), "work").passed).toBe(true);
  });

  it("matches slots by part of speech", () => {
    expect(fitsSlot("verb", { type: "word", english: "run", part_of_speech: "verb/noun" })).toBe(true);
    expect(fitsSlot("noun", { type: "word", english: "run", part_of_speech: "verb/noun" })).toBe(false);
    expect(fitsSlot("noun", { type: "word", english: "x", part_of_speech: null })).toBe(false);
    expect(fitsSlot("any", { type: "phrase", english: "break the ice" })).toBe(true);
    expect(fitsSlot("any", { type: "sentence", english: "Hi there." })).toBe(false);
  });

  it("picks a pattern with a fitting item, or null", () => {
    const items = [{ id: "1", type: "word", english: "travel", part_of_speech: "verb" }];
    const r = pickPattern("A1", items, () => 0);
    expect(r?.pattern.slot).toBe("verb");
    expect(r?.item.id).toBe("1");
    expect(pickPattern("A1", [{ id: "2", type: "sentence", english: "Hi." }], () => 0)).toBeNull();
  });
});

describe("active vocabulary", () => {
  it("counts distinct Tashkent days, capped", () => {
    const uses = [
      { item_id: "a", created_at: "2026-11-01T05:00:00Z" },
      { item_id: "a", created_at: "2026-11-01T06:00:00Z" },
      { item_id: "a", created_at: "2026-11-02T05:00:00Z" },
      { item_id: "a", created_at: "2026-11-03T05:00:00Z" },
      { item_id: "a", created_at: "2026-11-04T05:00:00Z" },
      // 20:00 UTC on the 4th is already the 5th in Tashkent, still one day for b
      { item_id: "b", created_at: "2026-11-04T20:00:00Z" },
      { item_id: "b", created_at: "2026-11-05T03:00:00Z" },
    ];
    const p = spokenDays(uses);
    expect(p.get("a")).toBe(ACTIVE_DAYS);
    expect(p.get("b")).toBe(1);
    expect(activeCount(p)).toBe(1);
  });
});

describe("translation bank", () => {
  const raw = JSON.parse(readFileSync("public/sentences/translate.json", "utf8")) as {
    e: string;
    u: string;
    l: TranslationPrompt["level"];
    w: string[];
  }[];
  const bank = raw.map((r) => ({ english: r.e, uzbek: r.u, level: r.l, words: r.w }));

  it("has prompts for every level", () => {
    for (const l of ["A1", "A2", "B1", "B2", "C1", "C2"] as const) {
      expect(bank.filter((b) => b.level === l).length).toBeGreaterThan(50);
    }
  });

  it("prefers sentences with library words", () => {
    const withBox = bank.find((b) => b.level === "A1" && b.words.includes("box"))!;
    const r = pickTranslation(bank, "A1", new Set(["box"]), () => 0);
    expect(r?.word).toBe("box");
    expect(r?.prompt.words).toContain("box");
    expect(withBox).toBeTruthy();
    expect(pickTranslation(bank, "A1", new Set(), () => 0)?.word).toBeNull();
  });

  it("example files map headwords to sentences", () => {
    const a1 = JSON.parse(readFileSync("public/sentences/a1.json", "utf8")) as Record<string, string[]>;
    expect(Object.keys(a1).length).toBeGreaterThan(800);
    expect(a1["book"]?.length).toBeGreaterThan(0);
  });
});

describe("session examples from the bank", async () => {
  const { bankExample } = await import("@/lib/session/examples");
  it("picks the shortest sentence with the exact word", () => {
    expect(
      bankExample({ english: "book" }, ["I read a book every night.", "This book is mine.", "He booked it."]),
    ).toBe("This book is mine.");
    expect(bankExample({ english: "abandon" }, ["They abandoned the car."])).toBeNull();
    expect(bankExample({ english: "x" }, undefined)).toBeNull();
  });
});
