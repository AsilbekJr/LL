import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, DEFAULT_TZ, diffDays, startOfDayInTz, todayInTz, type IsoDate } from "@/lib/srs/dates";
import type { CardStatus, Database, Direction, ReviewResult, Tables } from "@/lib/supabase/database.types";
import { studyStreak } from "@/lib/i18n/format";
import { countByDay } from "./calendar";

type Client = SupabaseClient<Database>;

const PAGE = 1000;
const STUDIED = ["learning", "review", "mastered"] as const;
export const HISTORY_DAYS = 371; // 53 weeks of heatmap
export const FORECAST_DAYS = 62;

async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

function count(r: { count: number | null; error: { message: string } | null }): number {
  if (r.error) throw new Error(r.error.message);
  return r.count ?? 0;
}

export interface DaySnapshot {
  due: number;
  done: number;
  missed: number;
  reviews: number;
}

export interface CalendarData {
  today: IsoDate;
  timezone: string;
  /** Past days (from the nightly snapshot job). */
  history: Map<IsoDate, DaySnapshot>;
  /** Cards due on each future day. */
  forecast: Map<IsoDate, number>;
  /** Today, live. */
  todayDue: number;
  todayDone: number;
  todayReviews: number;
  streak: number;
}

/** Everything the calendar needs (and the base of the statistics page). */
export async function fetchCalendar(sb: Client, now = new Date()): Promise<CalendarData> {
  const { data: settings } = await sb.from("settings").select("timezone").maybeSingle();
  const timezone = settings?.timezone ?? DEFAULT_TZ;
  const today = todayInTz(timezone, now);
  const dayStart = startOfDayInTz(today, timezone).toISOString();

  const [snapshots, futureDue, due, logs] = await Promise.all([
    readAll((from, to) =>
      sb
        .from("daily_snapshots")
        .select("day, due_count, done_count, missed_count, reviews_count")
        .gte("day", addDays(today, -HISTORY_DAYS))
        .order("day")
        .range(from, to),
    ),
    readAll((from, to) =>
      sb
        .from("cards")
        .select("due_date")
        .in("status", [...STUDIED])
        .gt("due_date", today)
        .lte("due_date", addDays(today, FORECAST_DAYS))
        .order("due_date")
        .range(from, to),
    ),
    sb
      .from("cards")
      .select("id", { count: "exact", head: true })
      .in("status", [...STUDIED])
      .lte("due_date", today),
    readAll((from, to) =>
      sb
        .from("review_logs")
        .select("card_id, result")
        .gte("reviewed_at", dayStart)
        .order("id")
        .range(from, to),
    ),
  ]);

  const history = new Map<IsoDate, DaySnapshot>(
    snapshots.map((s) => [
      s.day,
      { due: s.due_count, done: s.done_count, missed: s.missed_count, reviews: s.reviews_count },
    ]),
  );
  const graded = logs.filter((l) => l.result !== null);
  const todayDone = new Set(graded.map((l) => l.card_id)).size;
  const studied = [...history.entries()].filter(([, s]) => s.done > 0).map(([d]) => d);
  if (todayDone > 0) studied.push(today);

  return {
    today,
    timezone,
    history,
    forecast: countByDay(futureDue.map((c) => c.due_date)),
    todayDue: count(due),
    todayDone,
    todayReviews: graded.length,
    streak: studyStreak(studied, today),
  };
}

export interface StatsData extends CalendarData {
  items: number;
  statusCounts: Record<CardStatus, number>;
  /** Share of graded reviews in the last 30 days that were not "again" (null without reviews). */
  accuracy30: number | null;
  reviews30: number;
  /** Seconds spent answering in the last 7 days. */
  studySeconds7: number;
  /** Spoken production seconds in the last 7 days. */
  speakingSeconds7: number;
  productions: { written: number; spoken: number };
  hardest: { english: string; uzbek: string; lapses: number }[];
}

export async function fetchStats(sb: Client, now = new Date()): Promise<StatsData> {
  const base = await fetchCalendar(sb, now);
  const since30 = startOfDayInTz(addDays(base.today, -29), base.timezone).toISOString();
  const since7 = startOfDayInTz(addDays(base.today, -6), base.timezone).toISOString();
  const statuses: CardStatus[] = ["new", "learning", "review", "mastered", "suspended"];
  const cards = () => sb.from("cards").select("id", { count: "exact", head: true });

  const [items, statusRes, logs30, prods, written, spoken, hardest] = await Promise.all([
    sb.from("items").select("id", { count: "exact", head: true }),
    Promise.all(statuses.map((s) => cards().eq("status", s))),
    readAll((from, to) =>
      sb
        .from("review_logs")
        .select("result, response_ms, reviewed_at")
        .gte("reviewed_at", since30)
        .order("id")
        .range(from, to),
    ),
    sb.from("productions").select("duration_ms").eq("mode", "spoken").gte("created_at", since7),
    sb
      .from("productions")
      .select("id", { count: "exact", head: true })
      .eq("mode", "written")
      .eq("passed", true),
    sb
      .from("productions")
      .select("id", { count: "exact", head: true })
      .eq("mode", "spoken")
      .eq("passed", true),
    sb
      .from("cards")
      .select("lapses, items(english, uzbek)")
      .gt("lapses", 0)
      .order("lapses", { ascending: false })
      .limit(5)
      .returns<
        (Pick<Tables<"cards">, "lapses"> & { items: Pick<Tables<"items">, "english" | "uzbek"> | null })[]
      >(),
  ]);
  if (prods.error) throw new Error(prods.error.message);
  if (hardest.error) throw new Error(hardest.error.message);

  const graded = logs30.filter((l) => l.result !== null);
  const ok = graded.filter((l) => l.result !== "again").length;
  // Cap each answer at 2 minutes so an idle tab does not inflate study time.
  const studyMs7 = logs30
    .filter((l) => l.reviewed_at >= since7)
    .reduce((s, l) => s + Math.min(l.response_ms ?? 0, 120_000), 0);

  return {
    ...base,
    items: count(items),
    statusCounts: Object.fromEntries(statuses.map((s, i) => [s, count(statusRes[i]!)])) as Record<
      CardStatus,
      number
    >,
    accuracy30: graded.length ? ok / graded.length : null,
    reviews30: graded.length,
    studySeconds7: Math.round(studyMs7 / 1000),
    speakingSeconds7: Math.round((prods.data ?? []).reduce((s, p) => s + (p.duration_ms ?? 0), 0) / 1000),
    productions: { written: count(written), spoken: count(spoken) },
    hardest: (hardest.data ?? [])
      .filter((h) => h.items)
      .map((h) => ({ english: h.items!.english, uzbek: h.items!.uzbek, lapses: h.lapses })),
  };
}

export interface DayItem {
  cardId: string;
  english: string;
  uzbek: string;
  direction: Direction;
  /** Planned days: days late (today only). Past days: last grade given that day. */
  overdueDays: number;
  lastResult: ReviewResult | null;
  /** Past days: how many graded answers this card got that day. */
  answers: number;
}

export interface DayItems {
  kind: "planned" | "reviewed";
  items: DayItem[];
  /** More rows exist than were loaded. */
  truncated: boolean;
}

const DAY_ITEMS_LIMIT = 100;

type PlannedRow = Pick<Tables<"cards">, "id" | "direction" | "due_date"> & {
  items: Pick<Tables<"items">, "english" | "uzbek"> | null;
};
type ReviewedRow = Pick<Tables<"review_logs">, "card_id" | "result" | "reviewed_at"> & {
  cards:
    | (Pick<Tables<"cards">, "direction"> & { items: Pick<Tables<"items">, "english" | "uzbek"> | null })
    | null;
};

/**
 * Items behind one calendar day: what is planned (today / future — today
 * includes everything overdue) or what was reviewed (past days).
 */
export async function fetchDayItems(
  sb: Client,
  day: IsoDate,
  today: IsoDate,
  timezone: string,
): Promise<DayItems> {
  if (day >= today) {
    let q = sb
      .from("cards")
      .select("id, direction, due_date, items(english, uzbek)")
      .in("status", [...STUDIED]);
    q = day === today ? q.lte("due_date", today) : q.eq("due_date", day);
    const { data, error } = await q
      .order("due_date")
      .limit(DAY_ITEMS_LIMIT + 1)
      .returns<PlannedRow[]>();
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter((r) => r.items);
    return {
      kind: "planned",
      truncated: rows.length > DAY_ITEMS_LIMIT,
      items: rows.slice(0, DAY_ITEMS_LIMIT).map((r) => ({
        cardId: r.id,
        english: r.items!.english,
        uzbek: r.items!.uzbek,
        direction: r.direction,
        overdueDays: r.due_date < today ? diffDays(today, r.due_date) : 0,
        lastResult: null,
        answers: 0,
      })),
    };
  }

  const from = startOfDayInTz(day, timezone).toISOString();
  const to = startOfDayInTz(addDays(day, 1), timezone).toISOString();
  const logs = await readAll((a, b) =>
    sb
      .from("review_logs")
      .select("card_id, result, reviewed_at, cards(direction, items(english, uzbek))")
      .gte("reviewed_at", from)
      .lt("reviewed_at", to)
      .not("result", "is", null)
      .order("reviewed_at")
      .range(a, b)
      .returns<ReviewedRow[]>(),
  );
  return { kind: "reviewed", ...groupReviewed(logs) };
}

/** One row per card: last grade of the day and number of answers. Pure — unit tested. */
export function groupReviewed(logs: readonly ReviewedRow[], limit = DAY_ITEMS_LIMIT): Omit<DayItems, "kind"> {
  const byCard = new Map<string, DayItem>();
  for (const l of logs) {
    if (!l.cards?.items) continue;
    const prev = byCard.get(l.card_id);
    byCard.set(l.card_id, {
      cardId: l.card_id,
      english: l.cards.items.english,
      uzbek: l.cards.items.uzbek,
      direction: l.cards.direction,
      overdueDays: 0,
      lastResult: l.result,
      answers: (prev?.answers ?? 0) + 1,
    });
  }
  const items = [...byCard.values()];
  return { items: items.slice(0, limit), truncated: items.length > limit };
}
