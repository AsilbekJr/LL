import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dayInTz, startOfDayInTz, type IsoDate } from "@/lib/srs/dates";
import { BACKLOG_HISTORY_DAYS, detectBacklog, dueWordCount, type Backlog } from "@/lib/srs/backlog";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Recent study history for the Qaytish rejimi; null when it could not be read. */
export type BacklogStats = { lastStudyDay: IsoDate | null; recentDone: number[] } | null;

/** The last study day before today and recent daily loads. Never throws (null on error). */
export async function loadBacklogStats(sb: Client, today: IsoDate, tz: string): Promise<BacklogStats> {
  const dayStart = startOfDayInTz(today, tz).toISOString();
  try {
    const [last, snapshots] = await Promise.all([
      sb
        .from("review_logs")
        .select("reviewed_at")
        .lt("reviewed_at", dayStart)
        .not("result", "is", null)
        .order("reviewed_at", { ascending: false })
        .limit(1),
      sb
        .from("daily_snapshots")
        .select("day, done_count")
        .gt("done_count", 0)
        .lt("day", today)
        .gte("day", addDays(today, -60))
        .order("day", { ascending: false })
        .limit(BACKLOG_HISTORY_DAYS),
    ]);
    if (last.error || snapshots.error) return null;
    const at = last.data?.[0]?.reviewed_at;
    return {
      lastStudyDay: at ? dayInTz(new Date(at), tz) : null,
      recentDone: (snapshots.data ?? []).map((r) => r.done_count),
    };
  } catch {
    return null;
  }
}

/**
 * Today's Qaytish rejimi state, computed the same way by the Bugun page and
 * the session. `dueRows` = cards due today or earlier; `reviewsDoneToday` =
 * cards already reviewed today (they were part of the day's load). Without
 * stats the mode is off.
 */
export function todayBacklog(
  stats: BacklogStats,
  opts: { today: IsoDate; dueRows: { item_id: string }[]; reviewsDoneToday: number },
): Backlog {
  const due = dueWordCount(opts.dueRows) + opts.reviewsDoneToday;
  if (!stats) return { active: false, normal: due, gapDays: 0, todayCap: due, remaining: 0, daysToClear: 0 };
  return detectBacklog({ dueAtStart: due, today: opts.today, ...stats });
}

/** The extra buildDailyQueue inputs for today's backlog state. */
export function backlogQueueOptions(backlog: Backlog, newLimit: number) {
  return backlog.active
    ? { newLimit: 0, reviewCap: backlog.todayCap, riskFirst: true }
    : { newLimit, reviewCap: undefined, riskFirst: false };
}
