import { addDays, type IsoDate } from "@/lib/srs/dates";
import { applyReview, type ReviewOutcome } from "@/lib/srs/scheduler";
import type { ReviewResult, SrsSettings } from "@/lib/srs/types";
import type { SessionCard } from "./exercise";

/**
 * Pure review-session state. The UI keeps one `SessionState`, calls
 * `answerCard` for every answer, and persists the returned writes.
 */
export interface SessionStats {
  again: number;
  hard: number;
  good: number;
  easy: number;
  /** First encounters (ungraded). */
  seen: number;
}

export interface SessionState {
  /** Card ids in study order; requeued cards appear again later. */
  order: string[];
  position: number;
  byId: Record<string, SessionCard>;
  stats: SessionStats;
  /** Distinct cards answered at least once. */
  touched: string[];
  /** Cards due per day (for load balancing), updated as the session goes. */
  load: Map<IsoDate, number>;
}

export function createSession(cards: SessionCard[], load: Map<IsoDate, number> = new Map()): SessionState {
  return {
    order: cards.map((c) => c.card.id),
    position: 0,
    byId: Object.fromEntries(cards.map((c) => [c.card.id, c])),
    stats: { again: 0, hard: 0, good: 0, easy: 0, seen: 0 },
    touched: [],
    load: new Map(load),
  };
}

export function currentCard(s: SessionState): SessionCard | null {
  const id = s.order[s.position];
  return id ? (s.byId[id] ?? null) : null;
}

export function isFinished(s: SessionState): boolean {
  return s.position >= s.order.length;
}

/** Cards left to show (including requeued repeats). */
export function remaining(s: SessionState): number {
  return Math.max(0, s.order.length - s.position);
}

/** After a first encounter the card comes back after this many others (so it is not instant). */
export const ENCOUNTER_GAP = 2;

export interface AnswerContext {
  settings: SrsSettings;
  today: IsoDate;
  now?: Date;
}

export interface AnswerResult {
  state: SessionState;
  outcome: ReviewOutcome;
  /** When the item became mastered, the sibling card must be promoted too. */
  siblingPatch: { id: string; status: "mastered"; dueDate: IsoDate } | null;
}

/** Preview the interval each grade would give (for button labels). Does not change state. */
export function previewIntervals(sc: SessionCard, ctx: AnswerContext): Record<ReviewResult, number> {
  const opts = {
    ...ctx,
    production: sc.production,
    siblingLadderComplete: sc.siblingComplete,
  };
  return {
    again: applyReview(sc.card, "again", opts).intervalDays,
    hard: applyReview(sc.card, "hard", opts).intervalDays,
    good: applyReview(sc.card, "good", opts).intervalDays,
    easy: applyReview(sc.card, "easy", opts).intervalDays,
  };
}

export function answerCard(s: SessionState, result: ReviewResult | null, ctx: AnswerContext): AnswerResult {
  const sc = currentCard(s);
  if (!sc) throw new Error("Session finished");

  const outcome = applyReview(sc.card, result, {
    ...ctx,
    production: sc.production,
    siblingLadderComplete: sc.siblingComplete,
    load: s.load,
  });

  const byId = { ...s.byId, [sc.card.id]: { ...sc, card: outcome.card } };
  const load = new Map(s.load);
  if (outcome.intervalDays > 0) load.set(outcome.card.dueDate, (load.get(outcome.card.dueDate) ?? 0) + 1);

  // Keep the sibling in sync when it is part of this session.
  let siblingPatch: AnswerResult["siblingPatch"] = null;
  if (sc.siblingId) {
    const sib = byId[sc.siblingId];
    if (outcome.itemMastered) {
      const dueDate = addDays(ctx.today, ctx.settings.maintenanceDays);
      siblingPatch = { id: sc.siblingId, status: "mastered", dueDate };
      if (sib) byId[sc.siblingId] = { ...sib, card: { ...sib.card, status: "mastered", dueDate } };
    } else if (sib && outcome.card.ladderStep >= ctx.settings.ladder.length) {
      byId[sc.siblingId] = { ...sib, siblingComplete: true };
    }
  }

  const order = [...s.order];
  if (outcome.requeue) {
    if (result === null) order.splice(Math.min(order.length, s.position + 1 + ENCOUNTER_GAP), 0, sc.card.id);
    else order.push(sc.card.id);
  }

  const stats = { ...s.stats };
  if (result === null) stats.seen++;
  else stats[result]++;

  return {
    state: {
      order,
      position: s.position + 1,
      byId,
      stats,
      touched: s.touched.includes(sc.card.id) ? s.touched : [...s.touched, sc.card.id],
      load,
    },
    outcome,
    siblingPatch,
  };
}

/** Share of graded answers that were not "again" (0..1), or null before any graded answer. */
export function accuracy(stats: SessionStats): number | null {
  const graded = stats.again + stats.hard + stats.good + stats.easy;
  return graded ? (graded - stats.again) / graded : null;
}
