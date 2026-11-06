import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/srs/dates";
import { applyReview, masteredCard } from "@/lib/srs/scheduler";
import { DEFAULT_SETTINGS, type SrsCard } from "@/lib/srs/types";

const TODAY = "2026-11-06";
const NOW = new Date("2026-11-06T07:00:00Z"); // 12:00 Tashkent
const DONE = { writtenPassed: true, spokenPassed: true };

function card(over: Partial<SrsCard> = {}): SrsCard {
  return {
    id: "c1",
    itemId: "i1",
    direction: "en_uz",
    stage: 1,
    ladderStep: 0,
    dueDate: TODAY,
    lapses: 0,
    reps: 0,
    status: "new",
    fsrsState: null,
    ...over,
  };
}

const ctx = { settings: DEFAULT_SETTINGS, today: TODAY, now: NOW, production: DONE };

describe("applyReview — first encounter", () => {
  it("moves a new card into learning at stage 2, due now, without touching the ladder", () => {
    const r = applyReview(card(), null, ctx);
    expect(r.card).toMatchObject({ status: "learning", stage: 2, ladderStep: 0, reps: 0, dueDate: TODAY });
    expect(r.requeue).toBe(true);
    expect(r.log.result).toBeNull();
  });
});

describe("applyReview — ladder mode", () => {
  it("Good advances ladder, stage and due date", () => {
    const r = applyReview(card({ status: "learning", stage: 2 }), "good", ctx);
    expect(r.card).toMatchObject({
      ladderStep: 1,
      stage: 3,
      dueDate: addDays(TODAY, 1),
      reps: 1,
      status: "learning",
    });
    expect(r.log).toMatchObject({
      ladderStepBefore: 0,
      ladderStepAfter: 1,
      intervalDays: 1,
      wasOverdue: false,
    });
  });

  it("becomes 'review' from step 2", () => {
    const r = applyReview(card({ status: "learning", stage: 3, ladderStep: 1 }), "good", ctx);
    expect(r.card).toMatchObject({ ladderStep: 2, status: "review", dueDate: addDays(TODAY, 3) });
  });

  it("Again is a lapse: back two steps, learning, due today, re-queued", () => {
    const r = applyReview(card({ status: "review", stage: 5, ladderStep: 4, reps: 6 }), "again", ctx);
    expect(r.card).toMatchObject({
      ladderStep: 2,
      status: "learning",
      stage: 4,
      lapses: 1,
      reps: 7,
      dueDate: TODAY,
    });
    expect(r.requeue).toBe(true);
  });

  it("logs and penalizes an overdue review", () => {
    const r = applyReview(
      card({ status: "review", stage: 4, ladderStep: 4, dueDate: "2026-11-02" }),
      "good",
      ctx,
    );
    expect(r.log).toMatchObject({ wasOverdue: true, overdueDays: 4, intervalDays: 16 }); // 20 × 0.8
    expect(r.card.dueDate).toBe(addDays(TODAY, 16));
  });

  it("holds the card at the production gate", () => {
    const r = applyReview(card({ status: "review", stage: 6, ladderStep: 5 }), "good", {
      ...ctx,
      production: { writtenPassed: true, spokenPassed: false },
    });
    expect(r.productionRequired).toBe(true);
    expect(r.card).toMatchObject({ ladderStep: 5, dueDate: addDays(TODAY, 20) });
  });

  it("applies load balancing when a load map is given", () => {
    const load = new Map([[addDays(TODAY, 20), 50]]);
    const r = applyReview(card({ status: "review", stage: 4, ladderStep: 4 }), "good", { ...ctx, load });
    expect(r.intervalDays).toBe(19);
  });

  it("leaves suspended cards alone", () => {
    const c = card({ status: "suspended", ladderStep: 3 });
    const r = applyReview(c, "good", ctx);
    expect(r.card).toBe(c);
    expect(r.requeue).toBe(false);
  });
});

describe("applyReview — mastery", () => {
  const last = card({ status: "review", stage: 6, ladderStep: 7 });

  it("does not master while the other direction is unfinished", () => {
    const r = applyReview(last, "good", { ...ctx, siblingLadderComplete: false });
    expect(r.itemMastered).toBe(false);
    expect(r.card).toMatchObject({ status: "review", ladderStep: 8, dueDate: addDays(TODAY, 100) });
  });

  it("masters the item when both directions are done: due in maintenanceDays", () => {
    const r = applyReview(last, "good", { ...ctx, siblingLadderComplete: true });
    expect(r.itemMastered).toBe(true);
    expect(r.card).toMatchObject({ status: "mastered", dueDate: addDays(TODAY, 180) });
  });

  it("masteredCard promotes the sibling", () => {
    const sib = card({
      id: "c2",
      direction: "uz_en",
      status: "review",
      ladderStep: 8,
      dueDate: "2027-01-01",
    });
    expect(masteredCard(sib, TODAY, DEFAULT_SETTINGS)).toMatchObject({
      status: "mastered",
      dueDate: "2027-05-05",
    });
  });

  it("a mastered card stays mastered on success and falls back on Again", () => {
    const m = card({ status: "mastered", stage: 6, ladderStep: 8 });
    expect(applyReview(m, "good", ctx).card).toMatchObject({
      status: "mastered",
      dueDate: addDays(TODAY, 180),
    });
    expect(applyReview(m, "again", ctx).card).toMatchObject({
      status: "learning",
      ladderStep: 6,
      dueDate: TODAY,
    });
  });
});

describe("applyReview — FSRS mode", () => {
  const fsrsCtx = { ...ctx, settings: { ...DEFAULT_SETTINGS, srsMode: "fsrs" as const } };

  it("stores an FSRS state and schedules from it", () => {
    const r = applyReview(card({ status: "learning", stage: 2 }), "good", fsrsCtx);
    expect(r.card.fsrsState).toMatchObject({ reps: 1 });
    expect(r.intervalDays).toBeGreaterThanOrEqual(0);
    expect(r.card.dueDate).toBe(addDays(TODAY, r.intervalDays));
  });

  it("Easy on a review card schedules further out than Hard", () => {
    let c = card({ status: "learning", stage: 2 });
    let now = NOW;
    for (let i = 0; i < 4; i++) {
      const r = applyReview(c, "good", { ...fsrsCtx, now });
      c = r.card;
      now = new Date(now.getTime() + Math.max(1, r.intervalDays) * 86_400_000);
    }
    const today = c.dueDate;
    const hard = applyReview(c, "hard", { ...fsrsCtx, now, today }).intervalDays;
    const easy = applyReview(c, "easy", { ...fsrsCtx, now, today }).intervalDays;
    expect(easy).toBeGreaterThan(hard);
  });

  it("the production gate also caps FSRS intervals", () => {
    const r = applyReview(card({ status: "review", stage: 6, ladderStep: 5 }), "easy", {
      ...fsrsCtx,
      production: { writtenPassed: false, spokenPassed: false },
    });
    expect(r.productionRequired).toBe(true);
    expect(r.intervalDays).toBeLessThanOrEqual(20);
  });
});
