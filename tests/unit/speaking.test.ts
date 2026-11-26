import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIVE_DAYS, activeCount, spokenDays } from "@/lib/production/active";
import { expandedTokens, wordSimilarity } from "@/lib/text/usage";
import type { TranslationPrompt } from "@/lib/vocab/sentences";

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
