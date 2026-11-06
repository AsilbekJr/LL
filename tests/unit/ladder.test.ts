import { describe, expect, it } from "vitest";
import { gateStartIndex, scheduleLadder, validateLadder } from "@/lib/srs/ladder";

const LADDER = [1, 3, 7, 12, 20, 35, 60, 100];
const open = { ladder: LADDER, productionDone: true, gateSteps: 3 };

describe("scheduleLadder — Good / Easy", () => {
  it("Good uses the current rung and moves up one step", () => {
    expect(scheduleLadder({ ...open, ladderStep: 0, result: "good" })).toMatchObject({
      ladderStep: 1,
      intervalDays: 1,
    });
    expect(scheduleLadder({ ...open, ladderStep: 2, result: "good" })).toMatchObject({
      ladderStep: 3,
      intervalDays: 7,
    });
  });

  it("walks the whole default ladder with Good", () => {
    let step = 0;
    const intervals: number[] = [];
    for (let i = 0; i < LADDER.length; i++) {
      const r = scheduleLadder({ ...open, ladderStep: step, result: "good" });
      intervals.push(r.intervalDays);
      step = r.ladderStep;
    }
    expect(intervals).toEqual(LADDER);
    expect(step).toBe(LADDER.length);
  });

  it("marks the ladder complete only after the last rung", () => {
    expect(scheduleLadder({ ...open, ladderStep: 6, result: "good" }).ladderComplete).toBe(false);
    expect(scheduleLadder({ ...open, ladderStep: 7, result: "good" })).toMatchObject({
      ladderStep: 8,
      intervalDays: 100,
      ladderComplete: true,
    });
  });

  it("Easy skips one rung", () => {
    expect(scheduleLadder({ ...open, ladderStep: 0, result: "easy" })).toMatchObject({
      ladderStep: 2,
      intervalDays: 3,
    });
  });

  it("Easy near the top is capped at the last rung", () => {
    expect(scheduleLadder({ ...open, ladderStep: 7, result: "easy" })).toMatchObject({
      ladderStep: 8,
      intervalDays: 100,
    });
  });

  it("a completed card stays on the last rung", () => {
    expect(scheduleLadder({ ...open, ladderStep: 8, result: "good" })).toMatchObject({
      ladderStep: 8,
      intervalDays: 100,
    });
  });
});

describe("scheduleLadder — Hard / Again", () => {
  it("Hard = max(1, round(rung × 0.6)) and keeps the step", () => {
    expect(scheduleLadder({ ...open, ladderStep: 4, result: "hard" })).toMatchObject({
      ladderStep: 4,
      intervalDays: 12,
    }); // 20×0.6
    expect(scheduleLadder({ ...open, ladderStep: 3, result: "hard" }).intervalDays).toBe(7); // 12×0.6=7.2
    expect(scheduleLadder({ ...open, ladderStep: 0, result: "hard" }).intervalDays).toBe(1); // 0.6 → min 1
  });

  it("Again drops two steps, is due today and re-queued", () => {
    expect(scheduleLadder({ ...open, ladderStep: 5, result: "again" })).toEqual({
      ladderStep: 3,
      intervalDays: 0,
      requeue: true,
      lapse: true,
      productionRequired: false,
      ladderComplete: false,
    });
  });

  it("Again never goes below step 0, and is not a lapse on a fresh card", () => {
    expect(scheduleLadder({ ...open, ladderStep: 1, result: "again" })).toMatchObject({
      ladderStep: 0,
      lapse: true,
    });
    expect(scheduleLadder({ ...open, ladderStep: 0, result: "again" })).toMatchObject({
      ladderStep: 0,
      lapse: false,
    });
  });
});

describe("scheduleLadder — overdue penalty", () => {
  it("shrinks Good intervals by 5% per overdue day", () => {
    // rung 20 days, 2 days overdue → ×0.9 = 18
    expect(scheduleLadder({ ...open, ladderStep: 4, result: "good", overdueDays: 2 }).intervalDays).toBe(18);
  });

  it("never shrinks below 70%", () => {
    expect(scheduleLadder({ ...open, ladderStep: 4, result: "good", overdueDays: 30 }).intervalDays).toBe(14);
  });

  it("can be disabled", () => {
    expect(
      scheduleLadder({ ...open, ladderStep: 4, result: "good", overdueDays: 5, overduePenalty: false })
        .intervalDays,
    ).toBe(20);
  });

  it("does not apply to Hard", () => {
    expect(scheduleLadder({ ...open, ladderStep: 4, result: "hard", overdueDays: 5 }).intervalDays).toBe(12);
  });
});

describe("scheduleLadder — production gate ('fake passing')", () => {
  const locked = { ladder: LADDER, productionDone: false, gateSteps: 3 };

  it("locks the top 3 rungs (35/60/100) by default", () => {
    expect(gateStartIndex(8, 3)).toBe(5);
    expect(LADDER[gateStartIndex(8, 3)]).toBe(35);
  });

  it("open rungs are not affected", () => {
    expect(scheduleLadder({ ...locked, ladderStep: 3, result: "good" })).toMatchObject({
      ladderStep: 4,
      intervalDays: 12,
      productionRequired: false,
    });
  });

  it("holds the card before the first locked rung and asks for production", () => {
    expect(scheduleLadder({ ...locked, ladderStep: 5, result: "good" })).toMatchObject({
      ladderStep: 5,
      intervalDays: 20,
      productionRequired: true,
      ladderComplete: false,
    });
  });

  it("Easy cannot jump over the gate", () => {
    expect(scheduleLadder({ ...locked, ladderStep: 4, result: "easy" })).toMatchObject({
      ladderStep: 5,
      intervalDays: 20,
      productionRequired: true,
    });
  });

  it("opens once production is done", () => {
    expect(scheduleLadder({ ...locked, productionDone: true, ladderStep: 5, result: "good" })).toMatchObject({
      ladderStep: 6,
      intervalDays: 35,
      productionRequired: false,
    });
  });

  it("gateSteps = 0 disables the gate", () => {
    expect(scheduleLadder({ ...locked, gateSteps: 0, ladderStep: 7, result: "good" }).ladderComplete).toBe(
      true,
    );
  });
});

describe("validateLadder", () => {
  it("accepts the default ladder", () => {
    expect(() => validateLadder(LADDER)).not.toThrow();
  });

  it.each([[[1]], [[3, 1]], [[1, 1, 2]], [[0, 2]], [[1, 2.5]]])("rejects %j", (ladder) => {
    expect(() => validateLadder(ladder)).toThrow(RangeError);
  });

  it("clamps an out-of-range step", () => {
    expect(scheduleLadder({ ...open, ladderStep: 99, result: "good" }).ladderStep).toBe(8);
    expect(scheduleLadder({ ...open, ladderStep: -3, result: "good" }).ladderStep).toBe(1);
  });
});
