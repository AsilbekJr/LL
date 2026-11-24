import { dayInTz, diffDays, type IsoDate } from "./dates";

/**
 * "Qaytish rejimi": after a break (or on an overloaded day) today's reviews
 * are capped at the user's usual daily load, new words pause, and the rest
 * waits for the next days. Nothing is moved in the database — due dates stay
 * as they are; only today's queue takes less, the most at-risk words first.
 */

/** Never cap a day below this many words. */
export const BACKLOG_MIN_CAP = 20;
/** Missed days that count as a break. */
export const BACKLOG_GAP_DAYS = 2;
/** A day this many times over the usual load is overloaded even without a break. */
export const BACKLOG_FACTOR = 1.5;
/** Study days looked at for the usual load. */
export const BACKLOG_HISTORY_DAYS = 14;

export interface BacklogInput {
  /** Words due today, counting the ones already reviewed today (the day's starting load). */
  dueAtStart: number;
  today: IsoDate;
  /** The last day before today with at least one answer; null if none. */
  lastStudyDay: IsoDate | null;
  /** Cards done on each recent study day (most recent first or any order). */
  recentDone: number[];
}

export interface Backlog {
  active: boolean;
  /** The user's usual daily load (words). */
  normal: number;
  /** Full days missed before today. */
  gapDays: number;
  /** Words to review today: `normal` when active, all due otherwise. */
  todayCap: number;
  /** Due words left for the next days. */
  remaining: number;
  /** Days after today needed to clear `remaining` at the usual pace. */
  daysToClear: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Usual daily load: the median of recent study days, never below the minimum. */
export function normalLoad(recentDone: number[]): number {
  const days = recentDone.filter((n) => n > 0).slice(0, BACKLOG_HISTORY_DAYS);
  return Math.max(BACKLOG_MIN_CAP, Math.round(median(days)));
}

export function detectBacklog(input: BacklogInput): Backlog {
  const normal = normalLoad(input.recentDone);
  const gapDays = input.lastStudyDay ? Math.max(0, diffDays(input.today, input.lastStudyDay) - 1) : 0;
  const due = Math.max(0, input.dueAtStart);
  const away = gapDays >= BACKLOG_GAP_DAYS;
  const overloaded = due > normal * BACKLOG_FACTOR;
  const active = due > normal && (away || overloaded);
  if (!active) return { active, normal, gapDays, todayCap: due, remaining: 0, daysToClear: 0 };
  const remaining = due - normal;
  return { active, normal, gapDays, todayCap: normal, remaining, daysToClear: Math.ceil(remaining / normal) };
}

/** Days between a card's last answer and its due date (its current interval); null if never answered. */
export function intervalOf(
  dueDate: IsoDate,
  lastReviewedAt: string | null | undefined,
  tz: string,
): number | null {
  if (!lastReviewedAt) return null;
  return Math.max(1, diffDays(dueDate, dayInTz(new Date(lastReviewedAt), tz)));
}

/** Number of distinct words among due cards (one card per word a day). */
export function dueWordCount(cards: { item_id: string }[]): number {
  return new Set(cards.map((c) => c.item_id)).size;
}

/**
 * How close a due card is to being forgotten: days late relative to its
 * interval. A 1-day word 3 days late (3) is far more at risk than a 35-day
 * word 3 days late (≈0.09). Cards still being learned always come first.
 */
export function forgettingRisk(
  card: { status: string; intervalDays?: number | null },
  overdueDays: number,
): number {
  const base = overdueDays / Math.max(1, card.intervalDays ?? 1);
  return card.status === "learning" ? 1000 + base : base;
}
