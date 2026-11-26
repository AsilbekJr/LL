import { describe, expect, it } from "vitest";
import { formatDayUz, greetingUz, studyStreak } from "@/lib/i18n/format";

describe("formatDayUz", () => {
  it("formats weekday, day and month in Uzbek", () => {
    expect(formatDayUz("2026-11-06")).toBe("Juma, 6-noyabr");
    expect(formatDayUz("2026-11-08")).toBe("Yakshanba, 8-noyabr");
    expect(formatDayUz("2027-01-01")).toBe("Juma, 1-yanvar");
  });
});

describe("greetingUz", () => {
  it.each([
    [5, "Xayrli tong"],
    [11, "Xayrli tong"],
    [12, "Xayrli kun"],
    [17, "Xayrli kun"],
    [18, "Xayrli kech"],
    [2, "Xayrli kech"],
  ] as const)("%i → %s", (hour, text) => {
    expect(greetingUz(hour)).toBe(text);
  });
});

describe("studyStreak", () => {
  const today = "2026-11-06";

  it("counts consecutive days ending today", () => {
    expect(studyStreak(["2026-11-06", "2026-11-05", "2026-11-04", "2026-11-01"], today)).toBe(3);
  });

  it("keeps yesterday's streak alive before today's session", () => {
    expect(studyStreak(["2026-11-05", "2026-11-04"], today)).toBe(2);
  });

  it("forgives one rest day a week", () => {
    // 11-05 missed (Thursday): a rest day; today not done yet.
    expect(studyStreak(["2026-11-04", "2026-11-03"], today)).toBe(2);
    // A rest day in the middle bridges the two runs.
    expect(studyStreak(["2026-11-06", "2026-11-05", "2026-11-03", "2026-11-02"], today)).toBe(4);
  });

  it("ends after two missed days in a row or two in one week", () => {
    expect(studyStreak(["2026-11-03", "2026-11-02"], today)).toBe(0);
    // Mon 11-02 … Fri 11-06: misses on 11-05 and 11-03 (same week).
    expect(studyStreak(["2026-11-06", "2026-11-04", "2026-11-02"], today)).toBe(2);
    // Misses in different weeks are both forgiven (Sun 11-01 and Thu 11-05).
    expect(studyStreak(["2026-11-06", "2026-11-04", "2026-11-03", "2026-11-02", "2026-10-31"], today)).toBe(
      5,
    );
    expect(studyStreak([], today)).toBe(0);
  });

  it("can be strict", () => {
    expect(studyStreak(["2026-11-04", "2026-11-03"], today, 0)).toBe(0);
  });
});
