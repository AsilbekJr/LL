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

/**
 * Consecutive study days ending today (or yesterday, if today is not done yet,
 * so the streak does not look broken in the morning). `studiedDays` = days with ≥1 review.
 */
export function studyStreak(studiedDays: Iterable<IsoDate>, today: IsoDate): number {
  const set = new Set(studiedDays);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Seconds a card usually takes: a known word is quick, a new one needs its sentences read. */
const REVIEW_SECONDS = 15;
const NEW_SECONDS = 40;

/** Rough length of today's session in minutes ("~4 daqiqa"), at least 1. */
export function sessionMinutes(reviews: number, newWords: number): number {
  return Math.max(1, Math.round((reviews * REVIEW_SECONDS + newWords * NEW_SECONDS) / 60));
}
