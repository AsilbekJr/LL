import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk } from "@/lib/items/dedupe";
import { dayInTz, type IsoDate } from "@/lib/srs/dates";
import { historiesFromLogs, totalsFromEncounters, type WordHistory } from "@/lib/srs/cohorts";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000;
/** Item ids per request (keeps the URL short). */
const IDS_PER_REQUEST = 100;

type LogRow = { reviewed_at: string; method: string; cards: { item_id: string } | null };

async function readPages(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: LogRow[] | null;
    error: { message: string } | null;
  }>,
): Promise<LogRow[]> {
  const out: LogRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

function toRows(logs: LogRow[], tz: string) {
  return logs.flatMap((l) =>
    l.cards ? [{ itemId: l.cards.item_id, day: dayInTz(new Date(l.reviewed_at), tz), method: l.method }] : [],
  );
}

/** Review history (answers before `dayStart`) of the given words. */
export async function loadWordHistory(
  sb: Client,
  itemIds: string[],
  dayStart: string,
  tz: string,
): Promise<Map<string, WordHistory>> {
  const logs: LogRow[] = [];
  for (const ids of chunk([...new Set(itemIds)], IDS_PER_REQUEST)) {
    logs.push(
      ...(await readPages((from, to) =>
        sb
          .from("review_logs")
          .select("reviewed_at, method, cards!inner(item_id)")
          .in("cards.item_id", ids)
          .lt("reviewed_at", dayStart)
          .order("id")
          .range(from, to)
          .returns<LogRow[]>(),
      )),
    );
  }
  return historiesFromLogs(toRows(logs, tz));
}

/** Words first studied on each day before `dayStart` (whole library). */
export async function loadCohortTotals(
  sb: Client,
  dayStart: string,
  tz: string,
): Promise<Map<IsoDate, number>> {
  const logs = await readPages((from, to) =>
    sb
      .from("review_logs")
      .select("reviewed_at, method, cards!inner(item_id)")
      .eq("method", "encounter")
      .lt("reviewed_at", dayStart)
      .order("id")
      .range(from, to)
      .returns<LogRow[]>(),
  );
  return totalsFromEncounters(toRows(logs, tz));
}
