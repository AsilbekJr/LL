import { addDays, type IsoDate } from "@/lib/srs/dates";

/** Day of week, Monday = 0 … Sunday = 6 (Uzbek calendars start on Monday). */
export function weekdayMon0(day: IsoDate): number {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
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
