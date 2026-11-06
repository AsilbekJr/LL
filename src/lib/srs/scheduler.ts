import { addDays, type IsoDate } from "./dates";
import { scheduleFsrs } from "./fsrs";
import { scheduleLadder } from "./ladder";
import { isProductionDone, NO_PRODUCTION } from "./mastery";
import { cardOverdueDays } from "./overdue";
import { balanceInterval } from "./queue";
import { nextStage } from "./stages";
import type { CardStatus, ProductionProgress, ReviewResult, SrsCard, SrsSettings } from "./types";

export interface ReviewContext {
  settings: SrsSettings;
  today: IsoDate;
  /** Wall clock, used by FSRS. */
  now?: Date;
  /** The item's production progress (gate + mastery). */
  production?: ProductionProgress;
  /** The other direction card of the same item has passed the whole ladder. */
  siblingLadderComplete?: boolean;
  /** Cards already due per day, for load balancing. Omit to disable. */
  load?: ReadonlyMap<IsoDate, number>;
}

export interface ReviewOutcome {
  card: SrsCard;
  intervalDays: number;
  overdueDays: number;
  /** Show the card again later in this session. */
  requeue: boolean;
  /** The production gate held the card; the session must give a production task. */
  productionRequired: boolean;
  /** This answer made the whole item mastered: also promote the sibling card (see `masteredCard`). */
  itemMastered: boolean;
  log: {
    result: ReviewResult | null;
    wasOverdue: boolean;
    overdueDays: number;
    ladderStepBefore: number;
    ladderStepAfter: number;
    intervalDays: number;
  };
}

function statusFor(ladderStep: number, result: ReviewResult): CardStatus {
  if (result === "again" || ladderStep < 2) return "learning";
  return "review";
}

/** The card as it looks once its item is mastered: due again in `maintenanceDays`. */
export function masteredCard(card: SrsCard, today: IsoDate, settings: SrsSettings): SrsCard {
  return { ...card, status: "mastered", dueDate: addDays(today, settings.maintenanceDays) };
}

/**
 * Apply one answer to a card. `result = null` is the ungraded first
 * encounter: the card enters learning at stage 2 and is shown again now.
 * Suspended cards are returned unchanged.
 */
export function applyReview(card: SrsCard, result: ReviewResult | null, ctx: ReviewContext): ReviewOutcome {
  const { settings, today } = ctx;
  const production = ctx.production ?? NO_PRODUCTION;
  const od = cardOverdueDays(card, today);
  const base = {
    overdueDays: od,
    productionRequired: false,
    itemMastered: false,
  };

  if (card.status === "suspended" || result === null) {
    const next: SrsCard =
      card.status === "suspended"
        ? card
        : {
            ...card,
            stage: nextStage(card.stage, null),
            status: card.status === "new" ? "learning" : card.status,
            dueDate: today,
          };
    return {
      ...base,
      card: next,
      intervalDays: 0,
      requeue: card.status !== "suspended",
      log: {
        result: null,
        wasOverdue: od > 0,
        overdueDays: od,
        ladderStepBefore: card.ladderStep,
        ladderStepAfter: card.ladderStep,
        intervalDays: 0,
      },
    };
  }

  const ladder = scheduleLadder({
    ladderStep: card.ladderStep,
    result,
    ladder: settings.ladder,
    overdueDays: od,
    overduePenalty: settings.overduePenalty,
    productionDone: isProductionDone(production),
    gateSteps: settings.productionGateSteps,
  });

  let intervalDays = ladder.intervalDays;
  let fsrsState = card.fsrsState ?? null;
  if (settings.srsMode === "fsrs") {
    const f = scheduleFsrs(card.fsrsState, result, ctx.now ?? new Date(), settings.timezone);
    fsrsState = f.fsrsState;
    // The production gate also caps FSRS, so FSRS cannot skip it either.
    intervalDays = ladder.productionRequired ? Math.min(f.intervalDays, ladder.intervalDays) : f.intervalDays;
  }
  if (ctx.load && intervalDays > 0) intervalDays = balanceInterval(today, intervalDays, ctx.load);

  const wasMastered = card.status === "mastered";
  const itemMastered =
    result !== "again" &&
    !wasMastered &&
    ladder.ladderComplete &&
    isProductionDone(production) &&
    (ctx.siblingLadderComplete ?? false);

  let status = statusFor(ladder.ladderStep, result);
  if (itemMastered || (wasMastered && result !== "again")) {
    status = "mastered";
    intervalDays = settings.maintenanceDays;
  }

  const next: SrsCard = {
    ...card,
    stage: nextStage(card.stage, result),
    ladderStep: ladder.ladderStep,
    dueDate: addDays(today, intervalDays),
    reps: card.reps + 1,
    lapses: card.lapses + (ladder.lapse ? 1 : 0),
    status,
    fsrsState,
  };

  return {
    ...base,
    card: next,
    intervalDays,
    requeue: ladder.requeue,
    productionRequired: ladder.productionRequired,
    itemMastered,
    log: {
      result,
      wasOverdue: od > 0,
      overdueDays: od,
      ladderStepBefore: card.ladderStep,
      ladderStepAfter: ladder.ladderStep,
      intervalDays,
    },
  };
}
