import { overduePenaltyFactor } from "./overdue";
import type { ReviewResult } from "./types";

/**
 * Interval-ladder scheduler.
 *
 * `ladderStep` = how many rungs the card has passed. Answering a card at
 * step `s` uses rung `s` (interval `ladder[s]` days):
 *   - Good:  interval = ladder[s],               step → s + 1
 *   - Easy:  interval = ladder[s + 1],           step → s + 2   (skips a rung)
 *   - Hard:  interval = max(1, round(ladder[s] × 0.6)), step unchanged
 *   - Again: step → max(0, s − 2), due today, re-queued at the end of the session
 * Good/Easy on an overdue card get the overdue penalty (overdue.ts).
 *
 * "Fake passing" gate: the top `gateSteps` rungs are locked until the item
 * has a passed written AND a passed spoken production. A locked answer is
 * held on the last open rung and flagged `productionRequired`, so the
 * session forces a production exercise there.
 */
export interface LadderInput {
  ladderStep: number;
  result: ReviewResult;
  ladder: number[];
  overdueDays?: number;
  overduePenalty?: boolean;
  /** Item has both a passed written and a passed spoken production. */
  productionDone?: boolean;
  gateSteps?: number;
}

export interface LadderOutcome {
  ladderStep: number;
  /** Days until the next review. 0 = again today. */
  intervalDays: number;
  /** Show the card again later in this session. */
  requeue: boolean;
  /** The answer was a lapse (Again on a card that had progress). */
  lapse: boolean;
  /** Progress was held back by the production gate. */
  productionRequired: boolean;
  /** Every rung has been passed. */
  ladderComplete: boolean;
}

export const HARD_FACTOR = 0.6;

export function validateLadder(ladder: number[]): void {
  if (ladder.length < 2 || ladder.length > 30) throw new RangeError("Ladder must have 2–30 rungs");
  ladder.forEach((v, i) => {
    if (!Number.isInteger(v) || v <= 0) throw new RangeError(`Ladder rung ${i} must be a positive integer`);
    if (i > 0 && v <= ladder[i - 1]!) throw new RangeError("Ladder must be strictly ascending");
  });
}

/** Index of the first rung locked by the production gate (= ladder.length if none). */
export function gateStartIndex(ladderLength: number, gateSteps: number): number {
  return Math.max(0, ladderLength - Math.max(0, gateSteps));
}

export function scheduleLadder(input: LadderInput): LadderOutcome {
  const { ladder, result } = input;
  validateLadder(ladder);
  const L = ladder.length;
  const s = Math.min(Math.max(0, Math.trunc(input.ladderStep)), L);
  const last = L - 1;

  if (result === "again") {
    return {
      ladderStep: Math.max(0, s - 2),
      intervalDays: 0,
      requeue: true,
      lapse: s > 0,
      productionRequired: false,
      ladderComplete: false,
    };
  }

  if (result === "hard") {
    const rung = Math.min(s, last);
    return {
      ladderStep: s,
      intervalDays: Math.max(1, Math.round(ladder[rung]! * HARD_FACTOR)),
      requeue: false,
      lapse: false,
      productionRequired: false,
      ladderComplete: s >= L,
    };
  }

  // good / easy
  let rung = Math.min(result === "easy" ? s + 1 : s, last);
  let step = Math.min(result === "easy" ? s + 2 : s + 1, L);
  let productionRequired = false;

  const gateStart = gateStartIndex(L, input.gateSteps ?? 0);
  if (!input.productionDone && gateStart < L && step > gateStart) {
    // Hold on the last open rung; the session must give a production task.
    step = gateStart;
    rung = Math.max(0, gateStart - 1);
    productionRequired = true;
  }

  const factor = overduePenaltyFactor(input.overdueDays ?? 0, input.overduePenalty ?? true);
  return {
    ladderStep: step,
    intervalDays: Math.max(1, Math.round(ladder[rung]! * factor)),
    requeue: false,
    lapse: false,
    productionRequired,
    ladderComplete: step >= L,
  };
}
