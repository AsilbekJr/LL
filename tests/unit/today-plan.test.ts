import { describe, expect, it } from "vitest";
import { buildDailyQueue, type QueueCard } from "@/lib/srs/queue";
import { startedItemsOf, trimCutItem, wordsStartedToday } from "@/lib/srs/today";

const TODAY = "2026-11-08";
const newPair = (id: string): QueueCard[] => [
  { id: `${id}e`, itemId: id, direction: "en_uz", dueDate: TODAY, status: "new" },
  { id: `${id}u`, itemId: id, direction: "uz_en", dueDate: TODAY, status: "new" },
];
const rows = (cards: QueueCard[]) => cards.map((c) => ({ item_id: c.itemId }));

describe("today's plan", () => {
  it("one new word is one card in 'random' mode, two in 'both'", () => {
    const cards = newPair("a");
    const base = { cards, today: TODAY, newLimit: 15, reviewLimit: 150 };
    expect(buildDailyQueue({ ...base, directionMode: "random" })).toMatchObject({
      newWords: 1,
      newCount: 1,
      waitingWords: 1,
    });
    expect(buildDailyQueue({ ...base, directionMode: "both" }).newCount).toBe(2);
  });

  it("applies the daily limit, minus words started today", () => {
    const cards = ["a", "b", "c", "d"].flatMap(newPair);
    const q = buildDailyQueue({ cards, today: TODAY, newLimit: 3, reviewLimit: 150, newItemsDoneToday: 1 });
    expect(q).toMatchObject({ newWords: 2, waitingWords: 4 });
  });

  it("'random': the second direction never comes back the same day", () => {
    // Word "a": its EN→UZ card was learned today, the UZ→EN card is still new.
    const cards = [newPair("a")[1]!, ...newPair("b")];
    const started = startedItemsOf(rows(cards));
    expect(started).toEqual(new Set(["a"]));
    const q = buildDailyQueue({
      cards,
      today: TODAY,
      newLimit: 15,
      reviewLimit: 150,
      newItemsDoneToday: 1,
      startedItems: started,
      touchedToday: new Set(["a"]),
    });
    expect(q.queue.map((c) => c.itemId)).toEqual(["b"]);
    expect(q).toMatchObject({ waitingWords: 1, secondCount: 0 });
  });

  it("'random': the second direction comes on a later day without using the new-word limit", () => {
    const cards = [newPair("a")[1]!, ...newPair("b")];
    const q = buildDailyQueue({
      cards,
      today: TODAY,
      newLimit: 1,
      reviewLimit: 150,
      startedItems: startedItemsOf(rows(cards)),
    });
    expect(new Set(q.queue.map((c) => c.id))).toEqual(
      new Set(["au", q.queue.find((c) => c.itemId === "b")!.id]),
    );
    expect(q).toMatchObject({ newWords: 1, secondCount: 1 });
  });

  it("second directions share the review limit", () => {
    const cards = [newPair("a")[1]!, newPair("b")[1]!];
    const q = buildDailyQueue({
      cards,
      today: TODAY,
      newLimit: 15,
      reviewLimit: 1,
      startedItems: startedItemsOf(rows(cards)),
    });
    expect(q.secondCount).toBe(1);
  });

  it("counts only words begun today, not second directions", () => {
    // a: first seen today (both cards). b: second direction today, first one earlier.
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
});

describe("'random' reviews one direction per word a day", () => {
  const due = (id: string, itemId: string, over: Partial<QueueCard> = {}): QueueCard => ({
    id,
    itemId,
    direction: id.endsWith("u") ? "uz_en" : "en_uz",
    dueDate: TODAY,
    status: "learning",
    ...over,
  });

  it("13 words with both directions due are 13 reviews, not 26", () => {
    const cards = Array.from({ length: 13 }, (_, i) => [due(`${i}e`, `${i}`), due(`${i}u`, `${i}`)]).flat();
    const q = buildDailyQueue({ cards, today: TODAY, newLimit: 15, reviewLimit: 150 });
    expect(q.reviewCount).toBe(13);
    expect(new Set(q.queue.map((c) => c.itemId)).size).toBe(13);
    expect(q.deferred).toHaveLength(13);
    // 'both' still reviews every card.
    expect(
      buildDailyQueue({ cards, today: TODAY, newLimit: 15, reviewLimit: 150, directionMode: "both" })
        .reviewCount,
    ).toBe(26);
  });

  it("the more overdue direction comes first, then the one reviewed longer ago", () => {
    const a = buildDailyQueue({
      cards: [due("ae", "a"), due("au", "a", { dueDate: "2026-11-05" })],
      today: TODAY,
      newLimit: 0,
      reviewLimit: 9,
    });
    expect(a.queue.map((c) => c.id)).toEqual(["au"]);
    const b = buildDailyQueue({
      cards: [
        due("ae", "a", { lastReviewedAt: "2026-11-07T10:00:00Z" }),
        due("au", "a", { lastReviewedAt: "2026-11-06T10:00:00Z" }),
      ],
      today: TODAY,
      newLimit: 0,
      reviewLimit: 9,
    });
    expect(b.queue.map((c) => c.id)).toEqual(["au"]);
  });

  it("a second direction waits while the word has a review today", () => {
    const cards = [due("ae", "a"), { ...newPair("a")[1]! }];
    const q = buildDailyQueue({
      cards,
      today: TODAY,
      newLimit: 15,
      reviewLimit: 9,
      startedItems: new Set(["a"]),
    });
    expect(q.queue.map((c) => c.id)).toEqual(["ae"]);
  });
});
