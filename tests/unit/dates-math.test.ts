import { describe, expect, it } from "vitest";
import { addDays, daysBetween, diffDays, isIsoDate, overdueDays } from "@/lib/srs/dates";

describe("calendar-day arithmetic", () => {
  it("addDays crosses month, year and leap day", () => {
    expect(addDays("2026-11-06", 1)).toBe("2026-11-07");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-06", 180)).toBe("2027-05-05");
  });

  it("is not shifted by DST in the host timezone (tests run in America/New_York)", () => {
    // US DST ends 2026-11-01 and starts 2027-03-14.
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2027-03-13", 2)).toBe("2027-03-15");
    expect(diffDays("2027-03-15", "2027-03-13")).toBe(2);
  });

  it("diffDays is signed", () => {
    expect(diffDays("2026-11-10", "2026-11-06")).toBe(4);
    expect(diffDays("2026-11-06", "2026-11-10")).toBe(-4);
    expect(diffDays("2027-01-01", "2026-01-01")).toBe(365);
  });

  it("overdueDays is never negative", () => {
    expect(overdueDays("2026-11-01", "2026-11-06")).toBe(5);
    expect(overdueDays("2026-11-06", "2026-11-06")).toBe(0);
    expect(overdueDays("2026-11-09", "2026-11-06")).toBe(0);
  });

  it("daysBetween is inclusive", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(daysBetween("2026-11-06", "2026-11-05")).toEqual([]);
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-11-06")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-1-1")).toBe(false);
    expect(() => addDays("bad", 1)).toThrow(RangeError);
    expect(() => addDays("2026-11-06", 1.5)).toThrow(RangeError);
  });
});
