import { nextProductionMode } from "./mastery";
import type { ItemType, ProductionProgress, ReviewMethod, ReviewResult } from "./types";

/**
 * Card stages 1..6 pick the review method, from easy (passive) to hard
 * (active). Stages 7..9 (writing, speaking, free drill) are item-level and
 * live in `productions`, not on the card.
 */
export const MIN_GRADED_STAGE = 2;
export const MAX_CARD_STAGE = 6;

const WORD_METHODS: Record<number, ReviewMethod> = {
  1: "encounter",
  2: "recognition",
  3: "recall",
  4: "spelling",
  5: "listening",
  6: "cloze",
};

// Spelling a whole sentence is not useful; sentences get word order instead.
const SENTENCE_METHODS: Record<number, ReviewMethod> = {
  1: "encounter",
  2: "recognition",
  3: "recall",
  4: "listening",
  5: "cloze",
  6: "word_order",
};

export function clampStage(stage: number): number {
  return Math.min(MAX_CARD_STAGE, Math.max(1, Math.trunc(stage)));
}

/** The review method for a card stage. */
export function methodForStage(stage: number, itemType: ItemType): ReviewMethod {
  const table = itemType === "sentence" ? SENTENCE_METHODS : WORD_METHODS;
  return table[clampStage(stage)]!;
}

/**
 * Stage after an answer. `null` = the ungraded encounter (stage 1).
 * Good/Easy move up, Hard stays, Again moves one down (never back to the encounter).
 */
export function nextStage(stage: number, result: ReviewResult | null): number {
  const s = clampStage(stage);
  if (result === null) return Math.max(s, MIN_GRADED_STAGE);
  switch (result) {
    case "good":
    case "easy":
      return Math.min(MAX_CARD_STAGE, s + 1);
    case "hard":
      return Math.max(s, MIN_GRADED_STAGE);
    case "again":
      return Math.max(MIN_GRADED_STAGE, s - 1);
  }
}

/**
 * The method to show for a card right now. When the production gate holds
 * the card back, the item's missing production (writing, then speaking)
 * replaces the normal method.
 */
export function pickMethod(args: {
  stage: number;
  itemType: ItemType;
  productionRequired?: boolean;
  production?: ProductionProgress;
}): ReviewMethod {
  if (args.productionRequired && args.production) {
    const mode = nextProductionMode(args.production);
    if (mode === "written") return "writing";
    if (mode === "spoken") return "speaking";
  }
  return methodForStage(args.stage, args.itemType);
}
