import { describe, expect, it } from "vitest";
import {
  BACKLOG_MIN_CAP,
  detectBacklog,
  dueWordCount,
  forgettingRisk,
  intervalOf,
  normalLoad,
} from "@/lib/srs/backlog";
import { buildDailyQueue, type QueueCard } from "@/lib/srs/queue";

const TODAY = "2026-11-25";

describe("normalLoad", () => {
  it("is the median of recent study days", () => {
    expect(normalLoad([30, 24, 26, 90, 25])).toBe(26);
  });
  it("never goes below the minimum, also without history", () => {
    expect(normalLoad([5, 8])).toBe(BACKLOG_MIN_CAP);
    expect(normalLoad([])).toBe(BACKLOG_MIN_CAP);
  });
});

describe("detectBacklog", () => {
  const usual = [24, 24, 24, 24];

  it("is off on an ordinary day", () => {
    const b = detectBacklog({ dueAtStart: 26, today: TODAY, lastStudyDay: "2026-11-24", recentDone: usual });
    expect(b).toMatchObject({ active: false, todayCap: 26, remaining: 0, gapDays: 0 });
  });

  it("turns on after a 2+ day break when more than the usual load is due", () => {
    const b = detectBacklog({ dueAtStart: 65, today: TODAY, lastStudyDay: "2026-11-21", recentDone: usual });
    expect(b).toEqual({ active: true, normal: 24, gapDays: 3, todayCap: 24, remaining: 41, daysToClear: 2 });
  });

  it("stays off after a break if the due words fit in a usual day", () => {
    const b = detectBacklog({ dueAtStart: 20, today: TODAY, lastStudyDay: "2026-11-20", recentDone: usual });
    expect(b.active).toBe(false);
  });

  it("turns on for an overloaded day even without a break", () => {
    expect(
      detectBacklog({ dueAtStart: 37, today: TODAY, lastStudyDay: "2026-11-24", recentDone: usual }).active,
    ).toBe(true);
    expect(
      detectBacklog({ dueAtStart: 36, today: TODAY, lastStudyDay: "2026-11-24", recentDone: usual }).active,
    ).toBe(false);
  });

  it("a one-day gap is not a break", () => {
    const b = detectBacklog({ dueAtStart: 30, today: TODAY, lastStudyDay: "2026-11-23", recentDone: usual });
    expect([b.gapDays, b.active]).toEqual([1, false]);
  });
});

describe("helpers", () => {
  it("intervalOf: days from the last answer to the due date", () => {
    expect(intervalOf("2026-11-20", "2026-11-13T10:00:00Z", "Asia/Tashkent")).toBe(7);
    expect(intervalOf("2026-11-20", null, "Asia/Tashkent")).toBeNull();
  });
  it("dueWordCount counts words, not cards", () => {
    expect(dueWordCount([{ item_id: "a" }, { item_id: "a" }, { item_id: "b" }])).toBe(2);
  });
  it("a young word is more at risk than a mature one equally late; learning cards come first", () => {
    expect(forgettingRisk({ status: "review", intervalDays: 1 }, 3)).toBeGreaterThan(
      forgettingRisk({ status: "review", intervalDays: 35 }, 3),
    );
    expect(forgettingRisk({ status: "learning", intervalDays: 1 }, 0)).toBeGreaterThan(
      forgettingRisk({ status: "review", intervalDays: 1 }, 10),
    );
  });
});

describe("buildDailyQueue in Qaytish rejimi", () => {
  const due = (id: string, over: Partial<QueueCard> = {}): QueueCard => ({
    id,
    itemId: id,
    direction: "en_uz",
    dueDate: "2026-11-22",
    status: "review",
    ...over,
  });
  const newWord = (id: string): QueueCard => ({
    id,
    itemId: id,
    direction: "en_uz",
    dueDate: TODAY,
    status: "new",
  });

  it("caps today's reviews and lets no new words in", () => {
    const cards = [...Array.from({ length: 10 }, (_, i) => due(`d${i}`)), newWord("n1"), newWord("n2")];
    const q = buildDailyQueue({
      cards,
      today: TODAY,
      newLimit: 0,
      reviewLimit: 150,
      reviewCap: 4,
      riskFirst: true,
    });
    expect(q.queue).toHaveLength(4);
    expect(q.newWords).toBe(0);
    expect(q.dueRemaining).toBe(6);
  });

  it("the cap counts reviews already done today", () => {
    const cards = Array.from({ length: 10 }, (_, i) => due(`d${i}`));
    const q = buildDailyQueue({
      cards,
      today: TODAY,
      newLimit: 0,
      reviewLimit: 150,
      reviewCap: 4,
      reviewsDoneToday: 3,
    });
    expect(q.queue).toHaveLength(1);
  });

  it("puts young and learning words before mature ones, whatever the days late", () => {
    const cards = [
      due("mature", { dueDate: "2026-11-15", intervalDays: 35 }), // 10 days late, 35-day word
      due("young", { dueDate: "2026-11-22", intervalDays: 1 }), // 3 days late, 1-day word
      due("learning", { dueDate: TODAY, status: "learning", intervalDays: 1 }),
    ];
    const q = buildDailyQueue({
      cards,
      today: TODAY,
      newLimit: 0,
      reviewLimit: 150,
      reviewCap: 2,
      riskFirst: true,
    });
    expect(q.queue.map((c) => c.id)).toEqual(["learning", "young"]);
  });

  it("without riskFirst keeps the usual most-overdue-first order", () => {
    const cards = [
      due("young", { dueDate: "2026-11-22", intervalDays: 1 }),
      due("mature", { dueDate: "2026-11-15", intervalDays: 35 }),
    ];
    const q = buildDailyQueue({ cards, today: TODAY, newLimit: 0, reviewLimit: 150 });
    expect(q.queue.map((c) => c.id)).toEqual(["mature", "young"]);
  });

  it("still shows at most one card per word", () => {
    const cards = [
      due("a1", { itemId: "a", direction: "en_uz", intervalDays: 1 }),
      due("a2", { itemId: "a", direction: "uz_en", intervalDays: 3 }),
      due("b1", { itemId: "b", intervalDays: 2 }),
    ];
    const q = buildDailyQueue({
      cards,
      today: TODAY,
      newLimit: 0,
      reviewLimit: 150,
      reviewCap: 5,
      riskFirst: true,
    });
    const items = q.queue.map((c) => c.itemId);
    expect(new Set(items).size).toBe(items.length);
  });
});
