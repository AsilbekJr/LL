import { addDays, overdueDays, type IsoDate } from "./dates";
import { isDue } from "./overdue";
import type { SrsCard } from "./types";

export type DirectionMode = "random" | "en_uz" | "uz_en" | "both";
export type QueueCard = Pick<SrsCard, "id" | "itemId" | "direction" | "dueDate" | "status">;

export interface DailyQueueInput<C extends QueueCard> {
  /** All of the user's cards. New cards should come in the order they should be introduced. */
  cards: C[];
  today: IsoDate;
  /** Max NEW ITEMS introduced per day. */
  newLimit: number;
  /** Max due cards reviewed per day. */
  reviewLimit: number;
  /** New WORDS (items) started today — counted against `newLimit`. */
  newItemsDoneToday?: number;
  reviewsDoneToday?: number;
  /**
   * Items already being learned in at least one direction. Their remaining new
   * card is the word's second direction, not a new word: it does not use the
   * new-word limit (it shares the review limit instead).
   */
  startedItems?: ReadonlySet<string>;
  /** Items that had a card seen for the first time today. */
  touchedToday?: ReadonlySet<string>;
  directionMode?: DirectionMode;
  /** Random source in [0, 1); injectable for tests. */
  random?: () => number;
}

export interface DailyQueue<C extends QueueCard> {
  /** Cards in the order to study them. */
  queue: C[];
  reviewCount: number;
  /** New cards in the queue (new words plus second directions). */
  newCount: number;
  /** New words (items) started in this queue. */
  newWords: number;
  /** Second-direction cards of words already being learned. */
  secondCount: number;
  /** New words not started yet, today's included. */
  waitingWords: number;
  /** Due cards left out because of the review limit. */
  dueRemaining: number;
}

/**
 * Today's study queue:
 * 1. Due cards (overdue roll over to today), most overdue first, up to the review limit.
 * 2. New items up to the new limit; 'both' adds both directions, 'random' one random direction.
 *    The second direction of a started word comes on a later day ('random') within the review limit.
 * 3. New cards spread evenly between reviews, and two cards of the same item never back to back.
 */
export function buildDailyQueue<C extends QueueCard>(input: DailyQueueInput<C>): DailyQueue<C> {
  const { today } = input;
  const mode = input.directionMode ?? "random";
  const random = input.random ?? Math.random;
  const allowed = (c: C) => mode === "random" || mode === "both" || c.direction === mode;

  const due = input.cards
    .filter((c) => allowed(c) && isDue(c, today))
    .sort(
      (a, b) =>
        overdueDays(b.dueDate, today) - overdueDays(a.dueDate, today) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const reviewBudget = Math.max(0, input.reviewLimit - (input.reviewsDoneToday ?? 0));
  const reviews = due.slice(0, reviewBudget);

  // Group new cards by item, keeping first-seen item order.
  const started = input.startedItems ?? new Set<string>();
  const touched = input.touchedToday ?? new Set<string>();
  const newByItem = new Map<string, C[]>();
  const second: C[] = [];
  for (const c of input.cards) {
    if (c.status !== "new" || !allowed(c)) continue;
    if (started.has(c.itemId)) {
      // 'random' teaches one direction a day: the other one waits for a later day.
      if (mode === "random" && touched.has(c.itemId)) continue;
      second.push(c);
      continue;
    }
    const group = newByItem.get(c.itemId);
    if (group) group.push(c);
    else newByItem.set(c.itemId, [c]);
  }
  const newBudget = Math.max(0, input.newLimit - (input.newItemsDoneToday ?? 0));
  const words = [...newByItem.values()].slice(0, newBudget);
  const fresh: C[] = [];
  for (const group of words) {
    if (mode === "random" && group.length > 1) fresh.push(group[Math.floor(random() * group.length)]!);
    else fresh.push(...group);
  }
  // Second directions share what is left of the review limit.
  const seconds = second.slice(0, Math.max(0, reviewBudget - reviews.length));
  fresh.push(...seconds);

  return {
    queue: separateSameItem(interleave(reviews, fresh)),
    reviewCount: reviews.length,
    newCount: fresh.length,
    newWords: words.length,
    secondCount: seconds.length,
    waitingWords: newByItem.size,
    dueRemaining: due.length - reviews.length,
  };
}

/** Spread `extra` evenly through `base`, keeping both orders. */
export function interleave<A, B = A>(base: A[], extra: B[]): (A | B)[] {
  if (extra.length === 0) return [...base];
  if (base.length === 0) return [...extra];
  // Extra #e goes after `before(e)` base items; before() is non-decreasing.
  const gap = base.length / (extra.length + 1);
  const before = (e: number) => Math.min(base.length, Math.round(gap * (e + 1)));
  const out: (A | B)[] = [];
  let e = 0;
  for (let i = 0; i <= base.length; i++) {
    while (e < extra.length && before(e) === i) out.push(extra[e++]!);
    if (i < base.length) out.push(base[i]!);
  }
  return out;
}

/** Reorder so no two neighbours share an item (best effort, stable otherwise). */
export function separateSameItem<C extends Pick<QueueCard, "itemId">>(cards: C[]): C[] {
  const out = [...cards];
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]!.itemId;
    if (out[i]!.itemId !== prev) continue;
    const j = out.findIndex((c, k) => k > i && c.itemId !== prev);
    if (j === -1) break; // only this item is left
    out.splice(i, 0, ...out.splice(j, 1));
  }
  return out;
}

/**
 * Load balancing: for intervals ≥ 4 days, move the due day by up to ±10%
 * (max ±7 days) to the least loaded day. Ties prefer the exact interval,
 * then the earlier day. `load` maps day → number of cards already due.
 */
export function balanceInterval(
  today: IsoDate,
  intervalDays: number,
  load: ReadonlyMap<IsoDate, number>,
): number {
  if (intervalDays < 4) return intervalDays;
  const spread = Math.min(7, Math.max(1, Math.round(intervalDays * 0.1)));
  let best = intervalDays;
  let bestLoad = load.get(addDays(today, intervalDays)) ?? 0;
  for (let d = intervalDays - spread; d <= intervalDays + spread; d++) {
    const l = load.get(addDays(today, d)) ?? 0;
    const closer = Math.abs(d - intervalDays) < Math.abs(best - intervalDays);
    const sameDistEarlier = Math.abs(d - intervalDays) === Math.abs(best - intervalDays) && d < best;
    if (l < bestLoad || (l === bestLoad && (closer || sameDistEarlier))) {
      best = d;
      bestLoad = l;
    }
  }
  return best;
}
