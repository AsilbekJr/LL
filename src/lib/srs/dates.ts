/**
 * Calendar-day helpers. A "day" is always a calendar date (YYYY-MM-DD)
 * in the user's timezone (Asia/Tashkent by default), independent of the
 * device / server timezone.
 *
 * Day arithmetic is done on the date itself (as a UTC midnight), so it is
 * never affected by DST or the host timezone.
 */
export type IsoDate = string; // "YYYY-MM-DD"

export const DEFAULT_TZ = "Asia/Tashkent";

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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

/** UTC-midnight ms of a real YYYY-MM-DD date, or null if invalid. */
function parseIso(value: string): number | null {
  const m = ISO_RE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real ? date.getTime() : null;
}

/** True for a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(value: string): boolean {
  return parseIso(value) !== null;
}

function toUtcMs(day: IsoDate): number {
  const ms = parseIso(day);
  if (ms === null) throw new RangeError(`Invalid ISO date: ${day}`);
  return ms;
}

function fromUtcMs(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `day` shifted by `n` calendar days (n may be negative). */
export function addDays(day: IsoDate, n: number): IsoDate {
  if (!Number.isInteger(n)) throw new RangeError(`Day offset must be an integer: ${n}`);
  return fromUtcMs(toUtcMs(day) + n * MS_PER_DAY);
}

/** Whole calendar days from `from` to `to` (positive when `to` is later). */
export function diffDays(to: IsoDate, from: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Days a card is past its due date, as of `today`. Never negative. */
export function overdueDays(dueDate: IsoDate, today: IsoDate): number {
  return Math.max(0, diffDays(today, dueDate));
}

/** Offset (ms) of timezone `tz` from UTC at `instant` (e.g. +5h for Tashkent). */
export function tzOffsetMs(instant: Date, tz: string = DEFAULT_TZ): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant the calendar day `day` begins in timezone `tz` (for timestamptz range queries). */
export function startOfDayInTz(day: IsoDate, tz: string = DEFAULT_TZ): Date {
  const utcMidnight = toUtcMs(day);
  // Two passes handle a DST change between UTC midnight and local midnight.
  let guess = utcMidnight - tzOffsetMs(new Date(utcMidnight), tz);
  guess = utcMidnight - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

/** Hour of the day (0–23) at `instant` in timezone `tz`. */
export function hourInTz(instant: Date, tz: string = DEFAULT_TZ): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(instant),
  );
}

/** Ordered list of days from `from` to `to`, inclusive. Empty if `to` < `from`. */
export function daysBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const n = diffDays(to, from);
  const out: IsoDate[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}
