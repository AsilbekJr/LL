import { dayInTz } from "@/lib/srs/dates";

/**
 * Passive -> active vocabulary: a word counts as "active" once it has been
 * used correctly in speech on ACTIVE_DAYS different days (shadowing does not
 * count — repeating is not producing).
 */
export const ACTIVE_DAYS = 3;

/** item id -> number of distinct days with a passed spoken use (capped at ACTIVE_DAYS). */
export function spokenDays(
  uses: { item_id: string; created_at: string }[],
  tz?: string,
): Map<string, number> {
  const days = new Map<string, Set<string>>();
  for (const u of uses) {
    let set = days.get(u.item_id);
    if (!set) days.set(u.item_id, (set = new Set()));
    set.add(dayInTz(new Date(u.created_at), tz));
  }
  return new Map([...days].map(([id, s]) => [id, Math.min(ACTIVE_DAYS, s.size)]));
}

export function activeCount(progress: Map<string, number>): number {
  let n = 0;
  for (const d of progress.values()) if (d >= ACTIVE_DAYS) n++;
  return n;
}

// ---------- the active words journey -------------------------------------------------

/**
 * "1000 ta passiv emas, 500 ta aktiv so'z" is a slogan, not a ceiling: the
 * journey has no end. Milestones get wider as the vocabulary grows, and
 * after the last listed one there is a new one every 1000 words.
 */
export const ACTIVE_MILESTONES = [10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000] as const;
const STEP_AFTER_LAST = 1000;
const LAST_MILESTONE: number = ACTIVE_MILESTONES[ACTIVE_MILESTONES.length - 1]!;

function milestoneAfter(n: number): number {
  const listed = ACTIVE_MILESTONES.find((m) => m > n);
  if (listed !== undefined) return listed;
  const last = LAST_MILESTONE;
  return last + STEP_AFTER_LAST * (Math.floor((n - last) / STEP_AFTER_LAST) + 1);
}

function milestoneAtOrBefore(n: number): number {
  const last = LAST_MILESTONE;
  if (n >= last) return last + STEP_AFTER_LAST * Math.floor((n - last) / STEP_AFTER_LAST);
  return [...ACTIVE_MILESTONES].reverse().find((m) => m <= n) ?? 0;
}

export interface ActiveJourney {
  count: number;
  /** The milestone just passed (0 before the first). */
  prev: number;
  /** The next milestone — there always is one. */
  next: number;
  /** 0..1 from the previous milestone to the next. */
  toNext: number;
}

export function activeJourney(count: number): ActiveJourney {
  const n = Math.max(0, Math.floor(count));
  const prev = milestoneAtOrBefore(n);
  const next = milestoneAfter(n);
  return { count: n, prev, next, toNext: (n - prev) / (next - prev) };
}

/** The highest milestone crossed going from `before` to `after`, or null. */
export function crossedMilestone(before: number, after: number): number | null {
  if (after <= before) return null;
  const reached = milestoneAtOrBefore(after);
  return reached > before && reached > 0 ? reached : null;
}
