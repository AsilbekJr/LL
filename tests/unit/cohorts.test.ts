import { describe, expect, it } from "vitest";
import {
  cohortChips,
  groupTodayByCohort,
  historiesFromLogs,
  totalsFromEncounters,
  wordCohort,
  type PlanWord,
  type WordHistory,
} from "@/lib/srs/cohorts";

const TODAY = "2026-11-25";

const word = (itemId: string, over: Partial<PlanWord> = {}): PlanWord => ({
  itemId,
  dueDate: TODAY,
  status: "review",
  lapses: 0,
  ...over,
});
const hist = (entries: [string, string, number][]) =>
  new Map<string, WordHistory>(entries.map(([id, firstDay, pastDays]) => [id, { firstDay, pastDays }]));

describe("historiesFromLogs", () => {
  it("counts distinct answer days from the first encounter", () => {
    const h = historiesFromLogs([
      { itemId: "a", day: "2026-11-17", method: "encounter" },
      { itemId: "a", day: "2026-11-17", method: "recognition" },
      { itemId: "a", day: "2026-11-18", method: "recall" },
      { itemId: "a", day: "2026-11-18", method: "recall" },
      { itemId: "a", day: "2026-11-20", method: "cloze" },
      { itemId: "a", day: "2026-11-24", method: "recall" },
    ]);
    expect(h.get("a")).toEqual({ firstDay: "2026-11-17", pastDays: 4 });
  });

  it("uses the earliest encounter even when the second direction was met later", () => {
    const h = historiesFromLogs([
      { itemId: "a", day: "2026-11-21", method: "encounter" },
      { itemId: "a", day: "2026-11-10", method: "encounter" },
      { itemId: "a", day: "2026-11-12", method: "recall" },
    ]);
    expect(h.get("a")?.firstDay).toBe("2026-11-10");
  });

  it("falls back to the earliest answer without an encounter", () => {
    const h = historiesFromLogs([
      { itemId: "a", day: "2026-11-15", method: "recall" },
      { itemId: "a", day: "2026-11-12", method: "recall" },
    ]);
    expect(h.get("a")).toEqual({ firstDay: "2026-11-12", pastDays: 2 });
  });
});

describe("totalsFromEncounters", () => {
  it("counts each word once, on its first encounter day", () => {
    const t = totalsFromEncounters([
      { itemId: "a", day: "2026-11-17" },
      { itemId: "a", day: "2026-11-20" }, // second direction
      { itemId: "b", day: "2026-11-17" },
      { itemId: "c", day: "2026-11-20" },
    ]);
    expect(Object.fromEntries(t)).toEqual({ "2026-11-17": 2, "2026-11-20": 1 });
  });
});

describe("wordCohort", () => {
  it("a word studied on 4 earlier days is on its 4th review today", () => {
    expect(wordCohort(word("a"), hist([["a", "2026-11-17", 4]]), new Set(), TODAY)).toEqual({
      day: "2026-11-17",
      repetition: 4,
    });
  });

  it("a word met only once before is on its 1st review", () => {
    expect(wordCohort(word("a"), hist([["a", "2026-11-24", 1]]), new Set(), TODAY).repetition).toBe(1);
  });

  it("new words and words started today belong to today's cohort as a first meeting", () => {
    const none = hist([]);
    expect(wordCohort(word("n", { status: "new" }), none, new Set(), TODAY)).toEqual({
      day: TODAY,
      repetition: 0,
    });
    expect(wordCohort(word("s", { status: "learning" }), none, new Set(["s"]), TODAY)).toEqual({
      day: TODAY,
      repetition: 0,
    });
  });

  it("a scheduled word with no history goes to the unknown cohort", () => {
    expect(wordCohort(word("x"), hist([]), new Set(), TODAY)).toEqual({ day: null, repetition: 1 });
  });

  it("the second direction of a known word keeps the word's cohort", () => {
    expect(
      wordCohort(word("a", { status: "new" }), hist([["a", "2026-11-10", 3]]), new Set(), TODAY),
    ).toEqual({
      day: "2026-11-10",
      repetition: 3,
    });
  });
});

describe("groupTodayByCohort", () => {
  const history = hist([
    ["a", "2026-11-24", 1],
    ["b", "2026-11-24", 1],
    ["c", "2026-11-17", 4],
    ["d", "2026-11-17", 4],
    ["e", "2026-11-17", 1], // forgotten and back to the start
    ["f", "2026-11-08", 5],
  ]);
  const words = [
    word("a"),
    word("b", { dueDate: "2026-11-24" }),
    word("c"),
    word("d"),
    word("e", { status: "learning", lapses: 1 }),
    word("f"),
    word("n", { status: "new" }),
  ];
  const totals = new Map([
    ["2026-11-24", 8],
    ["2026-11-17", 10],
    ["2026-11-08", 7],
  ]);

  it("groups by first-study day, newest first, with counts that add up", () => {
    const rows = groupTodayByCohort(words, history, totals, TODAY);
    expect(rows.map((r) => [r.day, r.total, r.today, r.repetition])).toEqual([
      [TODAY, 1, 1, 0],
      ["2026-11-24", 8, 2, 1],
      ["2026-11-17", 10, 3, 4],
      ["2026-11-08", 7, 1, 5],
    ]);
    expect(rows.reduce((s, r) => s + r.today, 0)).toBe(words.length);
  });

  it("keeps per-word repetitions: range, overdue and relearning", () => {
    const nov17 = groupTodayByCohort(words, history, totals, TODAY).find((r) => r.day === "2026-11-17")!;
    expect([nov17.minRepetition, nov17.maxRepetition, nov17.relearning]).toEqual([1, 4, 1]);
    const nov24 = groupTodayByCohort(words, history, totals, TODAY).find((r) => r.day === "2026-11-24")!;
    expect(nov24.overdue).toBe(1);
  });

  it("counts a word once even if two of its cards are listed", () => {
    const rows = groupTodayByCohort([word("c"), word("c")], history, totals, TODAY);
    expect(rows[0]!.today).toBe(1);
  });

  it("total is never below today's count", () => {
    const rows = groupTodayByCohort(words, history, new Map(), TODAY);
    for (const r of rows) expect(r.total).toBeGreaterThanOrEqual(r.today);
  });

  it("folds the oldest days into the last row", () => {
    const many = Array.from({ length: 9 }, (_, i) => `2026-11-${String(10 + i).padStart(2, "0")}`);
    const h = hist(many.map((d, i) => [`w${i}`, d, 2]));
    const rows = groupTodayByCohort(
      many.map((_, i) => word(`w${i}`)),
      h,
      new Map(many.map((d) => [d, 3])),
      TODAY,
      new Set(),
      4,
    );
    expect(rows).toHaveLength(4);
    const last = rows[3]!;
    expect([last.day, last.fromDay, last.days, last.today, last.total]).toEqual([
      "2026-11-15",
      "2026-11-10",
      6,
      6,
      18,
    ]);
    expect(rows.reduce((s, r) => s + r.today, 0)).toBe(9);
  });

  it("keeps the unknown cohort as its own last row", () => {
    const rows = groupTodayByCohort([word("x"), word("c")], history, totals, TODAY);
    expect(rows.map((r) => r.day)).toEqual(["2026-11-17", null]);
  });
});

describe("cohortChips", () => {
  it("numbers words within their cohort in session order", () => {
    const history = hist([
      ["a", "2026-11-17", 4],
      ["b", "2026-11-20", 2],
      ["c", "2026-11-17", 4],
    ]);
    const chips = cohortChips([word("a"), word("b"), word("c"), word("a")], history, TODAY);
    expect(chips.get("a")).toEqual({ day: "2026-11-17", repetition: 4, index: 1, size: 2 });
    expect(chips.get("c")).toMatchObject({ index: 2, size: 2 });
    expect(chips.get("b")).toMatchObject({ index: 1, size: 1 });
  });
});
