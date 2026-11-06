import type { ProductionProgress, SrsCard } from "./types";

export const NO_PRODUCTION: ProductionProgress = { writtenPassed: false, spokenPassed: false };

/** Collapse an item's `productions` rows into gate progress. */
export function productionProgress(
  rows: { mode: "written" | "spoken"; passed: boolean }[],
): ProductionProgress {
  return {
    writtenPassed: rows.some((r) => r.passed && r.mode === "written"),
    spokenPassed: rows.some((r) => r.passed && r.mode === "spoken"),
  };
}

/** Both a written and a spoken production passed: the gate is open. */
export function isProductionDone(p: ProductionProgress): boolean {
  return p.writtenPassed && p.spokenPassed;
}

/** Which production the item still needs (written first), or null when done. */
export function nextProductionMode(p: ProductionProgress): "written" | "spoken" | null {
  if (!p.writtenPassed) return "written";
  if (!p.spokenPassed) return "spoken";
  return null;
}

/**
 * An item is mastered when BOTH direction cards have passed the whole
 * ladder and the production conditions hold. Suspended cards never count.
 */
export function isItemMastered(
  cards: Pick<SrsCard, "direction" | "ladderStep" | "status">[],
  production: ProductionProgress,
  ladderLength: number,
): boolean {
  if (!isProductionDone(production)) return false;
  for (const dir of ["en_uz", "uz_en"] as const) {
    const card = cards.find((c) => c.direction === dir);
    if (!card || card.status === "suspended" || card.ladderStep < ladderLength) return false;
  }
  return true;
}
