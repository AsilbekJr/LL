import { describe, expect, it } from "vitest";
import { isItemMastered, isProductionDone, nextProductionMode, productionProgress } from "@/lib/srs/mastery";
import { cardOverdueDays, isDue, overduePenaltyFactor, summarizeOverdue } from "@/lib/srs/overdue";
import { methodForStage, nextStage, pickMethod } from "@/lib/srs/stages";

const TODAY = "2026-11-06";

describe("overdue", () => {
  it("scheduled cards due today or earlier are due (rollover)", () => {
    expect(isDue({ status: "review", dueDate: "2026-11-01" }, TODAY)).toBe(true);
    expect(isDue({ status: "learning", dueDate: TODAY }, TODAY)).toBe(true);
    expect(isDue({ status: "review", dueDate: "2026-11-07" }, TODAY)).toBe(false);
  });

  it("new and suspended cards are never due or overdue", () => {
    expect(isDue({ status: "new", dueDate: "2026-11-01" }, TODAY)).toBe(false);
    expect(isDue({ status: "suspended", dueDate: "2026-11-01" }, TODAY)).toBe(false);
    expect(cardOverdueDays({ status: "suspended", dueDate: "2026-11-01" }, TODAY)).toBe(0);
    expect(cardOverdueDays({ status: "mastered", dueDate: "2026-11-01" }, TODAY)).toBe(5);
  });

  it("penalty factor = max(0.7, 1 − 0.05 × days)", () => {
    expect(overduePenaltyFactor(0)).toBe(1);
    expect(overduePenaltyFactor(1)).toBeCloseTo(0.95);
    expect(overduePenaltyFactor(4)).toBeCloseTo(0.8);
    expect(overduePenaltyFactor(6)).toBeCloseTo(0.7);
    expect(overduePenaltyFactor(50)).toBe(0.7);
    expect(overduePenaltyFactor(10, false)).toBe(1);
  });

  it("summarizes due / overdue", () => {
    const cards = [
      { status: "review" as const, dueDate: "2026-11-01" },
      { status: "review" as const, dueDate: "2026-11-04" },
      { status: "learning" as const, dueDate: TODAY },
      { status: "review" as const, dueDate: "2026-11-08" },
      { status: "new" as const, dueDate: "2026-10-01" },
    ];
    expect(summarizeOverdue(cards, TODAY)).toEqual({ due: 3, overdue: 2, maxOverdueDays: 5 });
  });
});

describe("mastery", () => {
  const both = { writtenPassed: true, spokenPassed: true };

  it("production progress counts only passed rows", () => {
    expect(
      productionProgress([
        { mode: "written", passed: true },
        { mode: "spoken", passed: false },
      ]),
    ).toEqual({ writtenPassed: true, spokenPassed: false });
  });

  it("needs written then spoken", () => {
    expect(nextProductionMode({ writtenPassed: false, spokenPassed: false })).toBe("written");
    expect(nextProductionMode({ writtenPassed: false, spokenPassed: true })).toBe("written");
    expect(nextProductionMode({ writtenPassed: true, spokenPassed: false })).toBe("spoken");
    expect(nextProductionMode(both)).toBeNull();
    expect(isProductionDone(both)).toBe(true);
  });

  it("mastered = both directions completed + production done", () => {
    const done = [
      { direction: "en_uz" as const, ladderStep: 8, status: "review" as const },
      { direction: "uz_en" as const, ladderStep: 8, status: "review" as const },
    ];
    expect(isItemMastered(done, both, 8)).toBe(true);
    expect(isItemMastered(done, { writtenPassed: true, spokenPassed: false }, 8)).toBe(false);
    expect(isItemMastered([done[0]!, { ...done[1]!, ladderStep: 7 }], both, 8)).toBe(false);
    expect(isItemMastered([done[0]!], both, 8)).toBe(false);
    expect(isItemMastered([done[0]!, { ...done[1]!, status: "suspended" }], both, 8)).toBe(false);
  });
});

describe("stages", () => {
  it("maps stages to methods for words and sentences", () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => methodForStage(s, "word"))).toEqual([
      "encounter",
      "recognition",
      "recall",
      "spelling",
      "listening",
      "cloze",
    ]);
    expect([1, 2, 3, 4, 5, 6].map((s) => methodForStage(s, "sentence"))).toEqual([
      "encounter",
      "recognition",
      "recall",
      "listening",
      "cloze",
      "word_order",
    ]);
    expect(methodForStage(99, "phrase")).toBe("cloze");
  });

  it("moves through stages", () => {
    expect(nextStage(1, null)).toBe(2); // encounter done
    expect(nextStage(2, "good")).toBe(3);
    expect(nextStage(2, "easy")).toBe(3);
    expect(nextStage(6, "good")).toBe(6);
    expect(nextStage(4, "hard")).toBe(4);
    expect(nextStage(4, "again")).toBe(3);
    expect(nextStage(2, "again")).toBe(2); // never back to the encounter
  });

  it("forces the missing production when the gate holds the card", () => {
    const base = { stage: 6, itemType: "word" as const, productionRequired: true };
    expect(pickMethod({ ...base, production: { writtenPassed: false, spokenPassed: false } })).toBe(
      "writing",
    );
    expect(pickMethod({ ...base, production: { writtenPassed: true, spokenPassed: false } })).toBe(
      "speaking",
    );
    expect(pickMethod({ ...base, production: { writtenPassed: true, spokenPassed: true } })).toBe("cloze");
    expect(pickMethod({ stage: 3, itemType: "word" })).toBe("recall");
  });
});
