import { addDays, overdueDays, type IsoDate } from "./dates";
import { isDue } from "./overdue";
import type { SrsCard } from "./types";

export type QueueCard = Pick<SrsCard, "id" | "itemId" | "direction" | "dueDate" | "status"> & {
  /** When the card was last graded (null = never); breaks ties so both directions take turns. */
  lastReviewedAt?: string | null;
};

/** The direction a new word starts with: understanding (EN→UZ) before producing (UZ→EN). */
export const FIRST_DIRECTION = "en_uz";

export interface DailyQueueInput<C extends QueueCard> {
  /** All of the user's cards. New cards should come in the order they should be introduced. */
  cards: C[];
  today: IsoDate;
  /** Max NEW WORDS introduced per day. */
  newLimit: number;
  /** Max cards reviewed per day. */
  reviewLimit: number;
  /** New WORDS (items) started today — counted against `newLimit`. */
  newItemsDoneToday?: number;
  reviewsDoneToday?: number;
  /**
   * Words already being learned in one direction. Their remaining new card is
   * the word's second direction, not a new word: it does not use the new-word
   * limit (it shares the review limit instead).
   */
  startedItems?: ReadonlySet<string>;
  /**
   * Started words whose first direction is known well enough (status review
   * or mastered) to open the second one.
   */
  readyItems?: ReadonlySet<string>;
  /** Words that had a card seen for the first time today. */
  touchedToday?: ReadonlySet<string>;
}

export interface DailyQueue<C extends QueueCard> {
  /** Cards in the order to study them: at most ONE card per word. */
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
  /**
   * Due cards left for another day because the other direction of the same
   * word is reviewed today (one direction per word per day).
   */
  deferred: C[];
}

/**
 * Today's study queue. The unit is the WORD: a word has two cards (EN→UZ and
 * UZ→EN), but shows at most one of them a day.
 * 1. Due cards (overdue roll over to today), most overdue first, up to the review limit.
 *    If both directions of a word are due, the more overdue one (on a tie the one
 *    reviewed longer ago) comes today and the other is deferred.
 * 2. New words up to the new limit, starting with EN→UZ.
 * 3. The second direction (UZ→EN) opens once the first is in review, on a day the
 *    word has nothing else; it shares the review limit.
 * 4. New cards are spread evenly between reviews.
 */
export function buildDailyQueue<C extends QueueCard>(input: DailyQueueInput<C>): DailyQueue<C> {
  const { today } = input;

  const allDue = input.cards
    .filter((c) => isDue(c, today))
    .sort(
      (a, b) =>
        overdueDays(b.dueDate, today) - overdueDays(a.dueDate, today) ||
        (a.lastReviewedAt ?? "").localeCompare(b.lastReviewedAt ?? "") ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const deferred: C[] = [];
  const dueItems = new Set<string>();
  const due = allDue.filter((c) => {
    if (dueItems.has(c.itemId)) {
      deferred.push(c);
      return false;
    }
    dueItems.add(c.itemId);
    return true;
  });
  const reviewBudget = Math.max(0, input.reviewLimit - (input.reviewsDoneToday ?? 0));
  const reviews = due.slice(0, reviewBudget);

  // Group new cards by item, keeping first-seen item order.
  const started = input.startedItems ?? new Set<string>();
  const ready = input.readyItems ?? new Set<string>();
  const touched = input.touchedToday ?? new Set<string>();
  const newByItem = new Map<string, C[]>();
  const second: C[] = [];
  for (const c of input.cards) {
    if (c.status !== "new") continue;
    if (started.has(c.itemId)) {
      if (ready.has(c.itemId) && !touched.has(c.itemId) && !dueItems.has(c.itemId)) second.push(c);
      continue;
    }
    const group = newByItem.get(c.itemId);
    if (group) group.push(c);
    else newByItem.set(c.itemId, [c]);
  }
  const newBudget = Math.max(0, input.newLimit - (input.newItemsDoneToday ?? 0));
  const words = [...newByItem.values()].slice(0, newBudget);
  const fresh: C[] = words.map((group) => group.find((c) => c.direction === FIRST_DIRECTION) ?? group[0]!);
  // Second directions share what is left of the review limit.
  const seconds = second.slice(0, Math.max(0, reviewBudget - reviews.length));
  fresh.push(...seconds);

  return {
    queue: interleave(reviews, fresh),
    reviewCount: reviews.length,
    newCount: fresh.length,
    newWords: words.length,
    secondCount: seconds.length,
    waitingWords: newByItem.size,
    deferred,
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
