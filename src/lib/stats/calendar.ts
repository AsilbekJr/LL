import { addDays, diffDays, type IsoDate } from "@/lib/srs/dates";

/** Day of week, Monday = 0 … Sunday = 6 (Uzbek calendars start on Monday). */
export function weekdayMon0(day: IsoDate): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function monthStart(day: IsoDate): IsoDate {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(day: IsoDate): IsoDate {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${day.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/** First day of the month `delta` months away. */
export function shiftMonth(day: IsoDate, delta: number): IsoDate {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

/** Weeks (Mon–Sun) covering the month; days outside the month are null. */
export function monthGrid(anyDayInMonth: IsoDate): (IsoDate | null)[][] {
  const first = monthStart(anyDayInMonth);
  const last = monthEnd(anyDayInMonth);
  const cells: (IsoDate | null)[] = Array.from({ length: weekdayMon0(first) }, () => null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks: (IsoDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Heatmap columns: `weeks` Mon–Sun columns ending with the week that contains `end`. */
export function heatmapColumns(end: IsoDate, weeks = 53): IsoDate[][] {
  const lastMonday = addDays(end, -weekdayMon0(end));
  const firstMonday = addDays(lastMonday, -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(firstMonday, w * 7 + d)),
  );
}

/**
 * Map counts to 0–5 levels for a sequential ramp. 0 stays 0; the rest split
 * at quantiles of the non-zero values so one huge day does not wash out the map.
 */
export function heatLevels(values: number[]): (v: number) => 0 | 1 | 2 | 3 | 4 | 5 {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!nz.length) return () => 0;
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor(p * nz.length))]!;
  const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
  return (v) => {
    if (v <= 0) return 0;
    let level = 1;
    for (const c of cuts) if (v > c) level++;
    return Math.min(5, level) as 1 | 2 | 3 | 4 | 5;
  };
}

export type DayStatus = "done" | "partial" | "missed" | "planned" | "rest";

export interface DayCounts {
  due: number;
  done: number;
  missed: number;
}

/** Status of a calendar day for the month view. */
export function dayStatus(day: IsoDate, today: IsoDate, c: DayCounts | undefined): DayStatus {
  if (!c || (c.due === 0 && c.done === 0)) return "rest";
  if (day > today) return "planned";
  // Today: `due` is what is still left, `done` what is already reviewed.
  if (day === today) return c.due === 0 ? "done" : c.done > 0 ? "partial" : "planned";
  if (c.missed === 0) return "done";
  return c.done > 0 ? "partial" : "missed";
}

/** Fill a dense series of `n` days ending at `end` from a sparse day→value map. */
export function denseSeries(
  map: ReadonlyMap<IsoDate, number>,
  end: IsoDate,
  n: number,
): { day: IsoDate; value: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(end, i - n + 1);
    return { day, value: map.get(day) ?? 0 };
  });
}

/** Count occurrences per day. */
export function countByDay(days: IsoDate[]): Map<IsoDate, number> {
  const m = new Map<IsoDate, number>();
  for (const d of days) m.set(d, (m.get(d) ?? 0) + 1);
  return m;
}

/** "Nice" axis maximum: 1, 2, 5 × 10^k at or above `max`. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

export function daysInRange(from: IsoDate, to: IsoDate): number {
  return diffDays(to, from) + 1;
}
