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

// ---------- the 500 active words journey -------------------------------------------------

/** "1000 ta passiv emas, 500 ta aktiv so'z": the goal the app is built around. */
export const ACTIVE_GOAL = 500;
export const ACTIVE_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500] as const;

export interface ActiveJourney {
  count: number;
  goal: number;
  /** The milestone just passed (0 before the first). */
  prev: number;
  /** The next milestone, null once the goal is reached. */
  next: number | null;
  /** 0..1 towards the next milestone. */
  toNext: number;
  /** 0..1 towards the goal. */
  toGoal: number;
}

export function activeJourney(count: number): ActiveJourney {
  const n = Math.max(0, Math.floor(count));
  const next = ACTIVE_MILESTONES.find((m) => m > n) ?? null;
  const prev = [...ACTIVE_MILESTONES].reverse().find((m) => m <= n) ?? 0;
  return {
    count: n,
    goal: ACTIVE_GOAL,
    prev,
    next,
    toNext: next === null ? 1 : (n - prev) / (next - prev),
    toGoal: Math.min(1, n / ACTIVE_GOAL),
  };
}

/** The highest milestone crossed going from `before` to `after`, or null. */
export function crossedMilestone(before: number, after: number): number | null {
  const crossed = ACTIVE_MILESTONES.filter((m) => m > before && m <= after);
  return crossed.length ? crossed[crossed.length - 1]! : null;
}
