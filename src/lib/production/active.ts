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
