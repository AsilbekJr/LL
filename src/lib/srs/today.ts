import type { DirectionMode } from "./queue";

/**
 * New words in today's plan, counted the way the review session builds its
 * queue (buildDailyQueue): new words are WORDS (items), not cards — every
 * word has two cards (EN→UZ and UZ→EN) — and only `newLimit` words a day.
 */
export interface NewWordsPlan {
  /** Words that are new and not yet seen. */
  waitingWords: number;
  /** Of those, how many today's session will teach (daily limit applied). */
  todayWords: number;
  /** Cards those words put into today's session (matches the session length). */
  todayCards: number;
  /** Words left for the coming days because the daily limit is reached. */
  laterWords: number;
}

export function newWordsPlan(input: {
  newCards: { item_id: string; direction: string }[];
  newLimit: number;
  newItemsDoneToday: number;
  directionMode: DirectionMode;
}): NewWordsPlan {
  const mode = input.directionMode;
  const byItem = new Map<string, number>();
  for (const c of input.newCards) {
    if (mode !== "random" && mode !== "both" && c.direction !== mode) continue;
    byItem.set(c.item_id, (byItem.get(c.item_id) ?? 0) + 1);
  }
  const budget = Math.max(0, input.newLimit - input.newItemsDoneToday);
  const today = [...byItem.values()].slice(0, budget);
  // "random" shows one direction of each new word per day; the others show each allowed card.
  const todayCards = mode === "random" ? today.length : today.reduce((n, c) => n + c, 0);
  return {
    waitingWords: byItem.size,
    todayWords: today.length,
    todayCards,
    laterWords: byItem.size - today.length,
  };
}
