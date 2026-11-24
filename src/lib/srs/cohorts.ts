import type { IsoDate } from "./dates";

/**
 * "Takrorlash xaritasi": today's words grouped by the day they were first
 * studied (their cohort), with how many times each word has been reviewed.
 * Pure helpers shared by the Bugun page and the review session, so both show
 * the same numbers.
 *
 * The repetition number is counted per WORD, never per cohort: a forgotten
 * word starts over and a late one drifts, so words of one day spread apart.
 */

/** One word's past, from its review log (answers before today only). */
export interface WordHistory {
  /** Day the word was first studied. */
  firstDay: IsoDate;
  /** Distinct days before today with at least one answer, `firstDay` included. */
  pastDays: number;
}

/** A word in today's plan: the card shown for it. */
export interface PlanWord {
  itemId: string;
  dueDate: IsoDate;
  status: string;
  lapses: number;
}

/** Where one word of today's plan stands. */
export interface WordCohort {
  /** First-study day; today for a word met for the first time today; null if unknown. */
  day: IsoDate | null;
  /** 0 = first meeting (tanishuv), N = today is the word's N-th review day. */
  repetition: number;
}

export interface Cohort {
  /** First-study day (the newest one for a merged row); null = unknown. */
  day: IsoDate | null;
  /** The oldest day of a merged row; equal to `day` otherwise. */
  fromDay: IsoDate | null;
  /** How many first-study days this row covers (1 unless merged). */
  days: number;
  /** Words first studied on those days (whole library, not only today's). */
  total: number;
  /** Of them, words in today's plan. */
  today: number;
  /** The most common repetition number among today's words (ties → the higher). */
  repetition: number;
  minRepetition: number;
  maxRepetition: number;
  /** Words due before today. */
  overdue: number;
  /** Words being relearned after they were forgotten. */
  relearning: number;
}

/** Chip shown on a card in the session: its cohort and its place in it. */
export interface CohortChip extends WordCohort {
  /** 1-based position among today's words of the same day. */
  index: number;
  /** Today's words of the same day. */
  size: number;
}

/** Default number of rows on the Bugun page; older days fold into the last one. */
export const COHORT_ROWS = 6;

export function wordCohort(
  word: Pick<PlanWord, "itemId" | "status">,
  history: ReadonlyMap<string, WordHistory>,
  startedToday: ReadonlySet<string>,
  today: IsoDate,
): WordCohort {
  const h = history.get(word.itemId);
  if (!h || h.firstDay >= today) {
    if (word.status === "new" || startedToday.has(word.itemId)) return { day: today, repetition: 0 };
    // Scheduled without any answer on record (e.g. restored from an old backup).
    return { day: null, repetition: 1 };
  }
  return { day: h.firstDay, repetition: Math.max(1, h.pastDays) };
}

function mode(values: number[]): number {
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  let best = values[0] ?? 0;
  let bestN = 0;
  for (const [v, n] of count) {
    if (n > bestN || (n === bestN && v > best)) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/** Newest day first; unknown last. */
function compareDays(a: IsoDate | null, b: IsoDate | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

/**
 * Today's words grouped by first-study day, newest first. `totals` maps a day
 * to the words first studied that day in the whole library. When there are
 * more than `maxRows` days, the oldest ones fold into the last row.
 */
export function groupTodayByCohort(
  words: PlanWord[],
  history: ReadonlyMap<string, WordHistory>,
  totals: ReadonlyMap<IsoDate, number>,
  today: IsoDate,
  startedToday: ReadonlySet<string> = new Set(),
  maxRows = COHORT_ROWS,
): Cohort[] {
  const byDay = new Map<IsoDate | null, { word: PlanWord; repetition: number }[]>();
  const seen = new Set<string>();
  for (const word of words) {
    if (seen.has(word.itemId)) continue; // one row per word, whatever the cards
    seen.add(word.itemId);
    const c = wordCohort(word, history, startedToday, today);
    const list = byDay.get(c.day);
    const entry = { word, repetition: c.repetition };
    if (list) list.push(entry);
    else byDay.set(c.day, [entry]);
  }

  const days = [...byDay.keys()].sort(compareDays);
  const known = days.filter((d): d is IsoDate => d !== null);
  // Fold the oldest known days into one row; "unknown" always keeps its own row.
  const room = Math.max(1, maxRows - (byDay.has(null) ? 1 : 0));
  const groups: (IsoDate | null)[][] =
    known.length > room
      ? [...known.slice(0, room - 1).map((d) => [d]), known.slice(room - 1)]
      : known.map((d) => [d]);
  if (byDay.has(null)) groups.push([null]);

  return groups.map((group) => {
    const entries = group.flatMap((d) => byDay.get(d) ?? []);
    const reps = entries.map((e) => e.repetition);
    const today_ = entries.length;
    const total = group.reduce((sum, d) => sum + (d === null ? 0 : (totals.get(d) ?? 0)), 0);
    return {
      day: group[0] ?? null,
      fromDay: group[group.length - 1] ?? null,
      days: group.length,
      total: Math.max(total, today_),
      today: today_,
      repetition: mode(reps),
      minRepetition: Math.min(...reps),
      maxRepetition: Math.max(...reps),
      overdue: entries.filter((e) => e.word.dueDate < today && e.word.status !== "new").length,
      relearning: entries.filter((e) => e.word.status === "learning" && e.word.lapses > 0).length,
    };
  });
}

/** Per-word chips for the session, numbered in the order the words come. */
export function cohortChips(
  words: PlanWord[],
  history: ReadonlyMap<string, WordHistory>,
  today: IsoDate,
  startedToday: ReadonlySet<string> = new Set(),
): Map<string, CohortChip> {
  const cohorts = new Map<string, WordCohort>();
  for (const w of words) {
    if (!cohorts.has(w.itemId)) cohorts.set(w.itemId, wordCohort(w, history, startedToday, today));
  }
  const size = new Map<IsoDate | null, number>();
  for (const c of cohorts.values()) size.set(c.day, (size.get(c.day) ?? 0) + 1);
  const seen = new Map<IsoDate | null, number>();
  const out = new Map<string, CohortChip>();
  for (const [itemId, c] of cohorts) {
    const index = (seen.get(c.day) ?? 0) + 1;
    seen.set(c.day, index);
    out.set(itemId, { ...c, index, size: size.get(c.day) ?? 1 });
  }
  return out;
}

/**
 * Build word histories from review-log rows (before today). The first-study
 * day is the earliest "encounter" (the word's first meeting); words without
 * one fall back to their earliest answer.
 */
export function historiesFromLogs(
  rows: { itemId: string; day: IsoDate; method: string }[],
): Map<string, WordHistory> {
  const days = new Map<string, Set<IsoDate>>();
  const firstEncounter = new Map<string, IsoDate>();
  for (const r of rows) {
    const set = days.get(r.itemId);
    if (set) set.add(r.day);
    else days.set(r.itemId, new Set([r.day]));
    if (r.method === "encounter") {
      const f = firstEncounter.get(r.itemId);
      if (!f || r.day < f) firstEncounter.set(r.itemId, r.day);
    }
  }
  const out = new Map<string, WordHistory>();
  for (const [itemId, set] of days) {
    const sorted = [...set].sort();
    const firstDay = firstEncounter.get(itemId) ?? sorted[0]!;
    out.set(itemId, { firstDay, pastDays: sorted.filter((d) => d >= firstDay).length });
  }
  return out;
}

/** Words first studied on each day, from every encounter on record (before today). */
export function totalsFromEncounters(rows: { itemId: string; day: IsoDate }[]): Map<IsoDate, number> {
  const first = new Map<string, IsoDate>();
  for (const r of rows) {
    const f = first.get(r.itemId);
    if (!f || r.day < f) first.set(r.itemId, r.day);
  }
  const out = new Map<IsoDate, number>();
  for (const d of first.values()) out.set(d, (out.get(d) ?? 0) + 1);
  return out;
}
