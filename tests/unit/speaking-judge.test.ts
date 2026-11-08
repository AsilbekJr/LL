import { describe, expect, it } from "vitest";
import { pickDialogWords } from "@/lib/speaking/dialog";
import { findRestart, judgePassed, judgeToFeedback, type Judge } from "@/lib/speaking/judge";
import { fixPassed } from "@/lib/speaking/repeat";

const ok: Judge = {
  word_ok: true,
  task_ok: true,
  grammar_ok: true,
  natural: true,
  fluent: true,
  errors: [],
  corrected: "This film is too boring for me.",
  feedback_uz: "Zo'r!",
};

describe("speaking judge", () => {
  it("passes only when every check passes", () => {
    expect(judgePassed(ok)).toBe(true);
    for (const k of ["word_ok", "task_ok", "grammar_ok", "natural", "fluent"] as const) {
      expect(judgePassed({ ...ok, [k]: false })).toBe(false);
    }
  });

  it("maps to the stored feedback shape", () => {
    const f = judgeToFeedback({ ...ok, grammar_ok: false });
    expect(f.natural).toBe(false);
    expect(f.corrected).toBe(ok.corrected);
  });
});

describe("restart detection (offline)", () => {
  it("catches stutters, fillers and a restarted opening", () => {
    expect(findRestart("I I like coffee")).toBe("i i");
    expect(findRestart("it's too it's too late for me")).toBe("it's too it's too");
    expect(findRestart("um I think so")).toBe("um");
  });

  it("leaves good sentences alone", () => {
    expect(findRestart("I think I can do it")).toBeNull();
    expect(findRestart("this movie is too boring for me")).toBeNull();
    expect(findRestart("I had had enough")).toBeNull();
    expect(findRestart("the cat and the dog are friends")).toBeNull();
  });
});

describe("dialog word choice", () => {
  const items = [
    { id: "a", type: "word", cefr_level: "A1" },
    { id: "b", type: "word", cefr_level: "A2" },
    { id: "c", type: "word", cefr_level: "C1" },
    { id: "d", type: "sentence", cefr_level: "A1" },
    { id: "e", type: "phrase", cefr_level: null },
  ];

  it("prefers words not yet active, at or below the level, never sentences", () => {
    const progress = new Map([["a", 3]]);
    const picked = pickDialogWords(items, progress, "A2", () => 0.5, 3).map((i) => i.id);
    expect(picked).not.toContain("d");
    expect(picked).not.toContain("c");
    expect(picked.at(-1)).toBe("a"); // already active -> last
  });
});

describe("repeating a correction", () => {
  it("needs a close, clean repeat", () => {
    expect(fixPassed("this film is too boring for me", ok.corrected).passed).toBe(true);
    expect(fixPassed("this film too boring", ok.corrected).passed).toBe(false);
    expect(fixPassed("this film this film is too boring for me", ok.corrected).passed).toBe(false);
  });
});
