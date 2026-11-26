import { describe, expect, it } from "vitest";
import { activeJourney, crossedMilestone, ACTIVE_GOAL } from "@/lib/production/active";
import { sessionMinutes } from "@/lib/i18n/format";

describe("500 active words journey", () => {
  it("knows the milestone passed and the next one", () => {
    expect(activeJourney(0)).toMatchObject({ prev: 0, next: 10, toNext: 0, toGoal: 0 });
    expect(activeJourney(37)).toMatchObject({ prev: 25, next: 50 });
    expect(activeJourney(37).toNext).toBeCloseTo(12 / 25);
    expect(activeJourney(250).toGoal).toBe(0.5);
    expect(activeJourney(ACTIVE_GOAL)).toMatchObject({ next: null, toNext: 1, toGoal: 1 });
    expect(activeJourney(612).toGoal).toBe(1);
  });

  it("reports the highest milestone crossed", () => {
    expect(crossedMilestone(9, 10)).toBe(10);
    expect(crossedMilestone(10, 24)).toBeNull();
    expect(crossedMilestone(20, 60)).toBe(50);
    expect(crossedMilestone(499, 500)).toBe(500);
  });
});

describe("session length", () => {
  it("estimates minutes, at least one", () => {
    expect(sessionMinutes(0, 0)).toBe(1);
    expect(sessionMinutes(12, 0)).toBe(3);
    expect(sessionMinutes(20, 10)).toBe(12);
  });
});
