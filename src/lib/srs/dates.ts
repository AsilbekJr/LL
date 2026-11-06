/**
 * Calendar-day helpers. A "day" is always a calendar date (YYYY-MM-DD)
 * in the user's timezone (Asia/Tashkent by default), independent of the
 * device / server timezone. Expanded and fully tested in phase 2.
 */
export type IsoDate = string; // "YYYY-MM-DD"

export const DEFAULT_TZ = "Asia/Tashkent";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    // en-CA formats as YYYY-MM-DD
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    formatterCache.set(tz, f);
  }
  return f;
}

/** The calendar date of `instant` in timezone `tz`. */
export function dayInTz(instant: Date, tz: string = DEFAULT_TZ): IsoDate {
  return formatter(tz).format(instant);
}

/** Today's calendar date in timezone `tz`. */
export function todayInTz(tz: string = DEFAULT_TZ, now: Date = new Date()): IsoDate {
  return dayInTz(now, tz);
}
