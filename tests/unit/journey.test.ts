import { describe, expect, it } from "vitest";
import { activeJourney, crossedMilestone } from "@/lib/production/active";
import { sessionMinutes } from "@/lib/i18n/format";

describe("active words journey (no ceiling)", () => {
  it("knows the milestone passed and the next one", () => {
    expect(activeJourney(0)).toMatchObject({ prev: 0, next: 10, toNext: 0 });
    expect(activeJourney(37)).toMatchObject({ prev: 25, next: 50 });
    expect(activeJourney(37).toNext).toBeCloseTo(12 / 25);
    expect(activeJourney(500)).toMatchObject({ prev: 500, next: 750, toNext: 0 });
  });

  it("keeps going past the last listed milestone", () => {
    expect(activeJourney(3000)).toMatchObject({ prev: 3000, next: 4000 });
    expect(activeJourney(4321)).toMatchObject({ prev: 4000, next: 5000 });
  });

  it("reports the highest milestone crossed", () => {
    expect(crossedMilestone(9, 10)).toBe(10);
    expect(crossedMilestone(10, 24)).toBeNull();
    expect(crossedMilestone(20, 60)).toBe(50);
    expect(crossedMilestone(499, 500)).toBe(500);
    expect(crossedMilestone(3990, 4005)).toBe(4000);
    expect(crossedMilestone(5, 3)).toBeNull();
  });
});

describe("session length", () => {
  it("estimates minutes, at least one", () => {
    expect(sessionMinutes(0, 0)).toBe(1);
    expect(sessionMinutes(12, 0)).toBe(3);
    expect(sessionMinutes(20, 10)).toBe(12);
  });
});
