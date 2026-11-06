import { createEmptyCard, fsrs, Rating, type Card, type FSRS, type Grade } from "ts-fsrs";
import { dayInTz, diffDays, type IsoDate } from "./dates";
import type { FsrsState, ReviewResult } from "./types";

/**
 * Thin adapter over ts-fsrs. FSRS works with instants; the app works with
 * calendar days, so the FSRS due instant is converted to a day in the
 * user's timezone. Fuzz is off: load balancing is done by queue.ts.
 */
const scheduler: FSRS = fsrs({ enable_fuzz: false });

const GRADE: Record<ReviewResult, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function serializeFsrs(card: Card): FsrsState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    ...(card.last_review ? { last_review: card.last_review.toISOString() } : {}),
  };
}

export function deserializeFsrs(state: FsrsState | null | undefined, now: Date): Card {
  if (!state) return createEmptyCard(now);
  return {
    ...state,
    due: new Date(state.due),
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  };
}

export interface FsrsOutcome {
  fsrsState: FsrsState;
  dueDate: IsoDate;
  /** Calendar days from today to the due day (0 = again today). */
  intervalDays: number;
}

export function scheduleFsrs(
  state: FsrsState | null | undefined,
  result: ReviewResult,
  now: Date,
  tz: string,
): FsrsOutcome {
  const card = deserializeFsrs(state, now);
  const next = scheduler.next(card, now, GRADE[result]).card;
  const dueDate = dayInTz(next.due, tz);
  return {
    fsrsState: serializeFsrs(next),
    dueDate,
    intervalDays: Math.max(0, diffDays(dueDate, dayInTz(now, tz))),
  };
}
