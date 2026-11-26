import { addDays, dayInTz, type IsoDate } from "@/lib/srs/dates";
import { ACTIVE_DAYS } from "./active";

/**
 * "Haftalik xulosa": what a week of speaking added up to — words that became
 * active, how often words were used in speech, and the favourite word.
 * Shown at the end of the week (and on Monday, for the week just gone).
 */
export interface WeeklySummary {
  weekStart: IsoDate;
  /** Words whose ACTIVE_DAYS-th speaking day fell in this week. */
  newlyActive: string[];
  /** Passed spoken uses this week. */
  uses: number;
  /** The word used most this week (ties: the one used first). */
  top: { itemId: string; count: number } | null;
}

/** 0 = Monday … 6 = Sunday. */
function weekday(day: IsoDate): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * The week to sum up today: this week on Saturday and Sunday, last week on
 * Monday, none on other days (the card would only repeat itself).
 */
export function summaryWeek(today: IsoDate): IsoDate | null {
  const dow = weekday(today);
  if (dow >= 5) return addDays(today, -dow);
  if (dow === 0) return addDays(today, -7);
  return null;
}

export function weeklySummary(
  uses: { item_id: string; created_at: string }[],
  weekStart: IsoDate,
  tz?: string,
): WeeklySummary {
  const weekEnd = addDays(weekStart, 6);
  const daysByItem = new Map<string, Set<IsoDate>>();
  const countThisWeek = new Map<string, number>();
  let total = 0;
  // Oldest first, so "the day a word became active" and ties are well defined.
  const sorted = [...uses].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const becameActive = new Map<string, IsoDate>();
  for (const u of sorted) {
    const day = dayInTz(new Date(u.created_at), tz);
    if (day > weekEnd) continue;
    let days = daysByItem.get(u.item_id);
    if (!days) daysByItem.set(u.item_id, (days = new Set()));
    days.add(day);
    if (days.size === ACTIVE_DAYS && !becameActive.has(u.item_id)) becameActive.set(u.item_id, day);
    if (day >= weekStart) {
      total++;
      countThisWeek.set(u.item_id, (countThisWeek.get(u.item_id) ?? 0) + 1);
    }
  }
  let top: WeeklySummary["top"] = null;
  for (const [itemId, count] of countThisWeek) if (!top || count > top.count) top = { itemId, count };
  return {
    weekStart,
    newlyActive: [...becameActive].filter(([, d]) => d >= weekStart).map(([id]) => id),
    uses: total,
    top,
  };
}
