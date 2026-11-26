import { addDays, type IsoDate } from "@/lib/srs/dates";

const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const MONTHS = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/** "Juma, 6-noyabr" — Uzbek long date for a calendar day (no Intl uz locale dependency). */
export function formatDayUz(day: IsoDate): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${d}-${MONTHS[m - 1]}`;
}

/** "17-noyabr" — short Uzbek date for a calendar day. */
export function formatShortDayUz(day: IsoDate): string {
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  return `${d}-${MONTHS[m - 1]}`;
}

/** Greeting for the local hour. */
export function greetingUz(hour: number): "Xayrli tong" | "Xayrli kun" | "Xayrli kech" {
  if (hour >= 4 && hour < 12) return "Xayrli tong";
  if (hour >= 12 && hour < 18) return "Xayrli kun";
  return "Xayrli kech";
}

/** Missed days forgiven per calendar week (Mon–Sun): a rest day does not break a streak. */
export const REST_DAYS_PER_WEEK = 1;

function mondayOf(day: IsoDate): IsoDate {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

/**
 * Consecutive study days ending today (or yesterday, if today is not done yet,
 * so the streak does not look broken in the morning). `studiedDays` = days with ≥1 review.
 * One missed day per calendar week is a rest day: it does not count, but it
 * does not break the streak either — a streak should encourage, not scare.
 * Two missed days in a row, or two in one week, end it.
 */
export function studyStreak(
  studiedDays: Iterable<IsoDate>,
  today: IsoDate,
  restPerWeek = REST_DAYS_PER_WEEK,
): number {
  const set = new Set(studiedDays);
  const rested = new Map<IsoDate, number>();
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  for (;;) {
    if (set.has(day)) {
      n++;
      day = addDays(day, -1);
      continue;
    }
    const week = mondayOf(day);
    const used = rested.get(week) ?? 0;
    // A rest day only bridges two study days.
    if (used < restPerWeek && set.has(addDays(day, -1))) {
      rested.set(week, used + 1);
      day = addDays(day, -1);
      continue;
    }
    return n;
  }
}

/** Seconds a card usually takes: a known word is quick, a new one needs its sentences read. */
const REVIEW_SECONDS = 15;
const NEW_SECONDS = 40;

/** Rough length of today's session in minutes ("~4 daqiqa"), at least 1. */
export function sessionMinutes(reviews: number, newWords: number): number {
  return Math.max(1, Math.round((reviews * REVIEW_SECONDS + newWords * NEW_SECONDS) / 60));
}
