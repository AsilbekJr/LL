import { overdueDays, type IsoDate } from "./dates";
import type { SrsCard } from "./types";

/** Statuses whose cards are actually scheduled (new / suspended never are). */
const SCHEDULED = new Set(["learning", "review", "mastered"]);

/** True when the card should be in today's queue. Overdue cards roll over to today. */
export function isDue(card: Pick<SrsCard, "status" | "dueDate">, today: IsoDate): boolean {
  return SCHEDULED.has(card.status) && card.dueDate <= today;
}

/** Overdue days as shown in the UI (0 for new / suspended cards). */
export function cardOverdueDays(card: Pick<SrsCard, "status" | "dueDate">, today: IsoDate): number {
  return SCHEDULED.has(card.status) ? overdueDays(card.dueDate, today) : 0;
}

export const OVERDUE_PENALTY_PER_DAY = 0.05;
export const OVERDUE_PENALTY_FLOOR = 0.7;

/**
 * Interval multiplier for a Good/Easy answer on an overdue card:
 * `max(0.7, 1 − 0.05 × overdue_days)`. 1 when the penalty is disabled.
 */
export function overduePenaltyFactor(days: number, enabled = true): number {
  if (!enabled || days <= 0) return 1;
  return Math.max(OVERDUE_PENALTY_FLOOR, 1 - OVERDUE_PENALTY_PER_DAY * days);
}

export interface OverdueSummary {
  /** Cards due today or earlier. */
  due: number;
  /** Of those, cards due strictly before today. */
  overdue: number;
  /** The largest overdue_days value (0 if none). */
  maxOverdueDays: number;
}

export function summarizeOverdue(
  cards: Pick<SrsCard, "status" | "dueDate">[],
  today: IsoDate,
): OverdueSummary {
  let due = 0;
  let overdue = 0;
  let maxOverdueDays = 0;
  for (const c of cards) {
    if (!isDue(c, today)) continue;
    due++;
    const d = overdueDays(c.dueDate, today);
    if (d > 0) overdue++;
    if (d > maxOverdueDays) maxOverdueDays = d;
  }
  return { due, overdue, maxOverdueDays };
}
