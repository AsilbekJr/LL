import { describe, expect, it } from "vitest";
import { balanceInterval, buildDailyQueue, interleave, type QueueCard } from "@/lib/srs/queue";

const TODAY = "2026-11-06";

function card(id: string, itemId: string, over: Partial<QueueCard> = {}): QueueCard {
  return { id, itemId, direction: "en_uz", dueDate: TODAY, status: "review", ...over };
}

describe("buildDailyQueue", () => {
  it("puts the most overdue cards first and respects the review limit", () => {
    const cards = [
      card("a", "1", { dueDate: "2026-11-05" }),
      card("b", "2", { dueDate: "2026-11-01" }),
      card("c", "3", { dueDate: TODAY }),
      card("d", "4", { dueDate: "2026-11-07" }), // not due
    ];
    const q = buildDailyQueue({ cards, today: TODAY, newLimit: 0, reviewLimit: 2 });
    expect(q.queue.map((c) => c.id)).toEqual(["b", "a"]);
    expect(q).toMatchObject({ reviewCount: 2, newCount: 0, dueRemaining: 1 });
  });

  it("subtracts what was already done today", () => {
    const cards = [card("a", "1"), card("b", "2"), card("c", "3")];
    expect(
      buildDailyQueue({ cards, today: TODAY, newLimit: 0, reviewLimit: 3, reviewsDoneToday: 2 }).reviewCount,
    ).toBe(1);
  });

  it("limits new WORDS and starts each with EN→UZ only", () => {
    const cards = [
      card("1u", "1", { status: "new", direction: "uz_en" }),
      card("1e", "1", { status: "new" }),
      card("2e", "2", { status: "new" }),
      card("2u", "2", { status: "new", direction: "uz_en" }),
      card("3e", "3", { status: "new" }),
    ];
    const q = buildDailyQueue({ cards, today: TODAY, newLimit: 2, reviewLimit: 100 });
    expect(q.queue.map((c) => c.id)).toEqual(["1e", "2e"]);
    expect(q).toMatchObject({ newWords: 2, newCount: 2, waitingWords: 3 });
  });

  it("ignores suspended and future cards", () => {
    const cards = [card("a", "1", { status: "suspended" }), card("b", "2", { dueDate: "2026-12-01" })];
    expect(buildDailyQueue({ cards, today: TODAY, newLimit: 5, reviewLimit: 5 }).queue).toEqual([]);
  });

  it("never has two cards of one word", () => {
    const cards = [
      card("1e", "1"),
      card("1u", "1", { direction: "uz_en" }),
      card("2e", "2"),
      card("2u", "2", { direction: "uz_en" }),
    ];
    const q = buildDailyQueue({ cards, today: TODAY, newLimit: 0, reviewLimit: 9 });
    expect(q.queue.map((c) => c.itemId).sort()).toEqual(["1", "2"]);
    expect(q.deferred).toHaveLength(2);
  });
});

describe("interleave", () => {
  it("spreads extras evenly and keeps every element", () => {
    expect(interleave([1, 2, 3, 4, 5, 6], ["a", "b"])).toEqual([1, 2, "a", 3, 4, "b", 5, 6]);
    expect(interleave([1, 2], ["a", "b", "c", "d"])).toEqual(["a", 1, "b", "c", 2, "d"]);
    expect(interleave([], ["a"])).toEqual(["a"]);
    expect(interleave([1], [])).toEqual([1]);
  });

  it("keeps the relative order of both lists", () => {
    const out = interleave([1, 2, 3, 4, 5, 6, 7, 8, 9], ["a", "b", "c"]);
    expect(out).toHaveLength(12);
    expect(out.filter((x) => typeof x === "number")).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(out.filter((x) => typeof x === "string")).toEqual(["a", "b", "c"]);
  });
});

describe("balanceInterval", () => {
  it("leaves short intervals alone", () => {
    expect(balanceInterval(TODAY, 3, new Map([["2026-11-09", 100]]))).toBe(3);
  });

  it("keeps the exact interval when loads are equal", () => {
    expect(balanceInterval(TODAY, 20, new Map())).toBe(20);
  });

  it("moves to the least loaded day within ±10%", () => {
    // 20 days → ±2 → candidates 18..22 = 2026-11-24..28
    const load = new Map([
      ["2026-11-24", 5],
      ["2026-11-25", 9],
      ["2026-11-26", 9],
      ["2026-11-27", 2],
      ["2026-11-28", 1],
      ["2026-11-29", 0], // outside the window
    ]);
    expect(balanceInterval(TODAY, 20, load)).toBe(22);
  });

  it("prefers the earlier of two equally close, equally loaded days", () => {
    const load = new Map([["2026-11-26", 3]]); // day 20 is busy, 19 and 21 are empty
    expect(balanceInterval(TODAY, 20, load)).toBe(19);
  });
});
