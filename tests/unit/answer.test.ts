import { describe, expect, it } from "vitest";
import {
  acceptableAnswers,
  checkTyped,
  clozeLongestWord,
  levenshtein,
  makeCloze,
  normalizeAnswer,
  sentenceTokens,
  typoAllowance,
} from "@/lib/text/answer";

describe("normalizeAnswer", () => {
  it("ignores case, spacing, end punctuation and apostrophe style", () => {
    expect(normalizeAnswer("  Bo‘lmoq!! ")).toBe("bo'lmoq");
    expect(normalizeAnswer("O'zbek   tili.")).toBe("o'zbek tili");
    expect(normalizeAnswer("“Hello”, world?")).toBe("hello world");
  });
});

describe("acceptableAnswers", () => {
  it("splits alternatives and drops parenthesised hints", () => {
    expect(acceptableAnswers("yuk, bagaj")).toEqual(["yuk bagaj", "yuk", "bagaj"]);
    expect(acceptableAnswers("och (qorni och)")).toContain("och");
    expect(acceptableAnswers("to give up")).toEqual(["give up"]);
  });
});

describe("levenshtein", () => {
  it.each([
    ["", "", 0],
    ["abc", "", 3],
    ["kitten", "sitting", 3],
    ["luggage", "lugage", 1],
    ["same", "same", 0],
  ])("%s → %s = %i", (a, b, d) => {
    expect(levenshtein(a, b)).toBe(d);
  });
});

describe("checkTyped", () => {
  it("accepts exact answers leniently", () => {
    expect(checkTyped("Luggage.", "luggage").verdict).toBe("correct");
    expect(checkTyped("give up", "to give up").verdict).toBe("correct");
    expect(checkTyped("to give up", "give up").verdict).toBe("correct");
    expect(checkTyped("bagaj", "yuk, bagaj").verdict).toBe("correct");
  });

  it("treats a small slip in a long word as a typo", () => {
    expect(checkTyped("lugage", "luggage")).toMatchObject({ verdict: "typo", distance: 1 });
    expect(checkTyped("comprehensve", "comprehensive").verdict).toBe("typo");
  });

  it("is strict on short words and real mistakes", () => {
    expect(checkTyped("cat", "car").verdict).toBe("wrong");
    expect(checkTyped("banana", "luggage").verdict).toBe("wrong");
    expect(checkTyped("   ", "luggage").verdict).toBe("wrong");
  });

  it("typo allowance grows with length", () => {
    expect([3, 5, 6, 12, 30].map(typoAllowance)).toEqual([0, 1, 2, 2, 2]);
  });
});

describe("cloze", () => {
  it("blanks the term as a whole word, case-insensitively", () => {
    expect(makeCloze("I bought a train ticket online.", "ticket")).toEqual({
      before: "I bought a train ",
      answer: "ticket",
      after: " online.",
    });
    expect(makeCloze("Ticket please", "ticket")?.answer).toBe("Ticket");
  });

  it("handles multi-word terms and a leading 'to'", () => {
    expect(makeCloze("We got lost in the old town.", "get lost")).toBeNull(); // inflected → no cloze
    expect(makeCloze("I want to give up now", "to give up")).toEqual({
      before: "I want to ",
      answer: "give up",
      after: " now",
    });
  });

  it("does not match inside other words", () => {
    expect(makeCloze("The carpet is red", "car")).toBeNull();
  });

  it("hides the longest word of a sentence", () => {
    expect(clozeLongestWord("How much is it?")?.answer).toBe("much");
    expect(clozeLongestWord("Hi")).toBeNull();
  });

  it("tokenizes sentences for word order", () => {
    expect(sentenceTokens("  Nice to   meet you. ")).toEqual(["Nice", "to", "meet", "you."]);
  });
});
