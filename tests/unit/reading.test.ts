import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiTextRequestSchema, aiTextSchema } from "@/lib/reading/ai-text";
import { retellScore } from "@/lib/reading/score";
import {
  lookupCandidates,
  parseSentences,
  scheduleText,
  splitWords,
  TEXT_INTERVALS,
  type BuiltinText,
} from "@/lib/reading/texts";
import { usesTerm } from "@/lib/text/usage";

describe("text schedule", () => {
  it("climbs 1, 3, 7, 16, 35 and stays at 35", () => {
    let rep = 0;
    const gaps: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = scheduleText(rep, 0.9, "2026-11-07");
      gaps.push((Date.parse(r.dueDate) - Date.parse("2026-11-07")) / 86_400_000);
      rep = r.repetitions;
    }
    expect(gaps).toEqual([...TEXT_INTERVALS, 35, 35]);
  });

  it("repeats a weak practice tomorrow without moving up", () => {
    expect(scheduleText(2, 0.4, "2026-11-07")).toEqual({ repetitions: 2, dueDate: "2026-11-08" });
  });
});

describe("text helpers", () => {
  it("parses sentences defensively", () => {
    expect(parseSentences([["Hi.", "Salom."], ["", "x"], "bad", ["Only en"]])).toEqual([
      ["Hi.", "Salom."],
      ["Only en", ""],
    ]);
    expect(parseSentences(null)).toEqual([]);
  });

  it("splits words for tap-to-translate, keeping punctuation", () => {
    const parts = splitWords("I don't know, well-known.");
    expect(parts.filter((p) => p.word).map((p) => p.text)).toEqual(["I", "don't", "know", "well-known"]);
    expect(parts.map((p) => p.text).join("")).toBe("I don't know, well-known.");
  });

  it("offers base forms for inflected words", () => {
    expect(lookupCandidates("studies")).toContain("study");
    expect(lookupCandidates("stopped")).toContain("stop");
    expect(lookupCandidates("making")).toContain("make");
    expect(lookupCandidates("Tom's")).toEqual(["tom"]);
  });

  it("scores a retelling by key words and length", () => {
    const keys = ["umbrella", "borrow", "station"];
    expect(retellScore("umbrella borrow station", keys).score).toBeLessThan(0.2);
    const story =
      "This morning it was raining so I could not go to the station without an umbrella. " +
      "My neighbour was kind and let me borrow his old blue one, so I was happy.";
    const r = retellScore(story, keys);
    expect(r.used).toBe(3);
    expect(r.score).toBe(1);
    expect(retellScore("", keys).score).toBe(0);
  });
});

describe("built-in texts", () => {
  const index = JSON.parse(readFileSync("public/texts/index.json", "utf8")) as {
    id: string;
    level: string;
  }[];

  it("has texts for every level", () => {
    for (const l of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
      expect(index.filter((t) => t.level === l).length).toBeGreaterThanOrEqual(4);
    }
    expect(new Set(index.map((t) => t.id)).size).toBe(index.length);
  });

  it("every text is well-formed and uses its key words", () => {
    for (const l of ["a1", "a2", "b1", "b2", "c1", "c2"]) {
      const texts = JSON.parse(readFileSync(`public/texts/${l}.json`, "utf8")) as BuiltinText[];
      for (const t of texts) {
        expect(t.sentences.length).toBeGreaterThanOrEqual(5);
        for (const [en, uz] of t.sentences) {
          expect(en.trim().length).toBeGreaterThan(0);
          expect(uz.trim().length).toBeGreaterThan(0);
        }
        const body = t.sentences.map(([en]) => en).join(" ");
        for (const w of t.words) expect(usesTerm(body, w), `${t.id}: ${w}`).toBe(true);
      }
    }
  });
});

describe("ai text schemas", () => {
  it("validates requests and responses", () => {
    expect(aiTextRequestSchema.safeParse({ level: "B1", words: ["a"] }).success).toBe(true);
    expect(aiTextRequestSchema.safeParse({ level: "X", words: ["a"] }).success).toBe(false);
    expect(aiTextRequestSchema.safeParse({ level: "B1", words: Array(9).fill("w") }).success).toBe(false);
    const ok = {
      title: "T",
      title_uz: "T",
      sentences: Array.from({ length: 4 }, () => ({ en: "Hi.", uz: "Salom." })),
      key_words: ["hi"],
    };
    expect(aiTextSchema.safeParse(ok).success).toBe(true);
    expect(aiTextSchema.safeParse({ ...ok, sentences: [] }).success).toBe(false);
  });
});
