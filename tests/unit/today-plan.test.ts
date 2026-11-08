import { describe, expect, it } from "vitest";
import { newWordsPlan } from "@/lib/srs/today";

const cards = (items: string[]) =>
  items.flatMap((id) => [
    { item_id: id, direction: "en_uz" },
    { item_id: id, direction: "uz_en" },
  ]);

describe("today's new words", () => {
  it("counts words, not their two cards", () => {
    const p = newWordsPlan({
      newCards: cards(["a"]),
      newLimit: 15,
      newItemsDoneToday: 0,
      directionMode: "random",
    });
    expect(p).toEqual({ waitingWords: 1, todayWords: 1, todayCards: 1, laterWords: 0 });
  });

  it("applies the daily limit, minus words already seen today", () => {
    const p = newWordsPlan({
      newCards: cards(["a", "b", "c", "d"]),
      newLimit: 3,
      newItemsDoneToday: 1,
      directionMode: "random",
    });
    expect(p).toMatchObject({ waitingWords: 4, todayWords: 2, laterWords: 2 });
  });

  it("matches the session's card count per direction mode", () => {
    const base = { newCards: cards(["a", "b"]), newLimit: 15, newItemsDoneToday: 0 };
    expect(newWordsPlan({ ...base, directionMode: "both" }).todayCards).toBe(4);
    expect(newWordsPlan({ ...base, directionMode: "en_uz" }).todayCards).toBe(2);
    expect(newWordsPlan({ ...base, directionMode: "random" }).todayCards).toBe(2);
  });

  it("has nothing for today when the limit is used up", () => {
    const p = newWordsPlan({
      newCards: cards(["a"]),
      newLimit: 2,
      newItemsDoneToday: 5,
      directionMode: "random",
    });
    expect(p).toMatchObject({ todayWords: 0, todayCards: 0, laterWords: 1 });
  });
});
