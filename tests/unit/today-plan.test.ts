import { describe, expect, it } from "vitest";
import { buildDailyQueue, type QueueCard } from "@/lib/srs/queue";
import { reviewedPerDay, startedItemsOf, trimCutItem, wordsStartedToday } from "@/lib/srs/today";

const TODAY = "2026-11-08";
const newPair = (id: string): QueueCard[] => [
  { id: `${id}e`, itemId: id, direction: "en_uz", dueDate: TODAY, status: "new" },
  { id: `${id}u`, itemId: id, direction: "uz_en", dueDate: TODAY, status: "new" },
];
const due = (id: string, itemId: string, over: Partial<QueueCard> = {}): QueueCard => ({
  id,
  itemId,
  direction: id.endsWith("u") ? "uz_en" : "en_uz",
  dueDate: TODAY,
  status: "learning",
  ...over,
});
const rows = (cards: QueueCard[]) => cards.map((c) => ({ item_id: c.itemId }));
const base = { today: TODAY, newLimit: 15, reviewLimit: 150 };

/** The rule the whole "Bugun" page rests on. */
function expectOneCardPerWord(queue: QueueCard[]) {
  expect(new Set(queue.map((c) => c.itemId)).size).toBe(queue.length);
}

describe("today's plan: the unit is the word", () => {
  it("one new word is one card (EN→UZ)", () => {
    const q = buildDailyQueue({ ...base, cards: newPair("a") });
    expect(q.queue.map((c) => c.id)).toEqual(["ae"]);
    expect(q).toMatchObject({ newWords: 1, newCount: 1, waitingWords: 1 });
  });

  it("applies the daily limit, minus words started today", () => {
    const cards = ["a", "b", "c", "d"].flatMap(newPair);
    const q = buildDailyQueue({ ...base, cards, newLimit: 3, newItemsDoneToday: 1 });
    expect(q).toMatchObject({ newWords: 2, waitingWords: 4 });
  });

  it("13 words with both directions due are 13 reviews, not 26", () => {
    const cards = Array.from({ length: 13 }, (_, i) => [due(`${i}e`, `${i}`), due(`${i}u`, `${i}`)]).flat();
    const q = buildDailyQueue({ ...base, cards });
    expect(q.reviewCount).toBe(13);
    expect(q.deferred).toHaveLength(13);
    expectOneCardPerWord(q.queue);
  });

  it("of two due directions: the more overdue, then the one reviewed longer ago", () => {
    const a = buildDailyQueue({
      ...base,
      cards: [due("ae", "a"), due("au", "a", { dueDate: "2026-11-05" })],
    });
    expect(a.queue.map((c) => c.id)).toEqual(["au"]);
    const b = buildDailyQueue({
      ...base,
      cards: [
        due("ae", "a", { lastReviewedAt: "2026-11-07T10:00:00Z" }),
        due("au", "a", { lastReviewedAt: "2026-11-06T10:00:00Z" }),
      ],
    });
    expect(b.queue.map((c) => c.id)).toEqual(["au"]);
  });

  it("a mixed day never shows a word twice", () => {
    const cards = [
      due("ae", "a"),
      due("au", "a"),
      due("be", "b"),
      newPair("b")[1]!,
      ...newPair("c"),
      newPair("d")[1]!,
    ];
    const q = buildDailyQueue({
      ...base,
      cards,
      startedItems: new Set(["b", "d"]),
      readyItems: new Set(["b", "d"]),
    });
    expectOneCardPerWord(q.queue);
    expect(q.queue.map((c) => c.itemId).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("the second direction (UZ→EN)", () => {
  const second = newPair("a")[1]!;
  const started = new Set(["a"]);

  it("stays closed while the first direction is still being learned", () => {
    const q = buildDailyQueue({ ...base, cards: [second], startedItems: started });
    expect(q.queue).toEqual([]);
    expect(q.waitingWords).toBe(0); // not a new word either
  });

  it("opens once the first is in review, without using the new-word limit", () => {
    const cards = [second, ...newPair("b")];
    const q = buildDailyQueue({
      ...base,
      cards,
      newLimit: 1,
      startedItems: startedItemsOf(rows(cards)),
      readyItems: started,
    });
    expect(q.queue.map((c) => c.id).sort()).toEqual(["au", "be"]);
    expect(q).toMatchObject({ newWords: 1, secondCount: 1 });
    expectOneCardPerWord(q.queue);
  });

  it("waits on a day the word has a review or was first seen", () => {
    const withReview = buildDailyQueue({
      ...base,
      cards: [due("ae", "a"), second],
      startedItems: started,
      readyItems: started,
    });
    expect(withReview.queue.map((c) => c.id)).toEqual(["ae"]);
    const seenToday = buildDailyQueue({
      ...base,
      cards: [second],
      startedItems: started,
      readyItems: started,
      touchedToday: started,
    });
    expect(seenToday.queue).toEqual([]);
  });

  it("shares the review limit", () => {
    const cards = [newPair("a")[1]!, newPair("b")[1]!];
    const both = new Set(["a", "b"]);
    const q = buildDailyQueue({ ...base, cards, reviewLimit: 1, startedItems: both, readyItems: both });
    expect(q.secondCount).toBe(1);
  });
});

describe("today helpers", () => {
  it("counts only words begun today, not second directions", () => {
    // a: first seen today. b: second direction today, first one earlier.
    const cards = [
      { id: "ae", item_id: "a", status: "learning" },
      { id: "au", item_id: "a", status: "new" },
      { id: "be", item_id: "b", status: "review" },
      { id: "bu", item_id: "b", status: "learning" },
    ];
    expect(wordsStartedToday(new Set(["ae", "bu"]), cards)).toBe(1);
  });

  it("drops a pair cut by the scan limit", () => {
    const r = [{ item_id: "a" }, { item_id: "a" }, { item_id: "b" }];
    expect(trimCutItem(r, 3)).toEqual([{ item_id: "a" }, { item_id: "a" }]);
    expect(trimCutItem(r, 4)).toBe(r);
  });

  it("calendar and statistics count one card per word a day, overdue folded into today", () => {
    const c = (item_id: string, due_date: string, last_reviewed_at: string | null = null) => ({
      item_id,
      due_date,
      last_reviewed_at,
    });
    const cards = [
      c("a", "2026-11-07"),
      c("a", TODAY),
      c("b", "2026-11-09"),
      c("b", "2026-11-09", "2026-11-01T00:00:00Z"),
      c("c", "2026-11-09"),
      c("c", "2026-11-10"),
    ];
    expect(reviewedPerDay(cards, TODAY)).toEqual([cards[0], cards[2], cards[4], cards[5]]);
  });
});
