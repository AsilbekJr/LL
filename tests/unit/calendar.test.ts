import { describe, expect, it } from "vitest";
import {
  countByDay,
  denseSeries,
  heatLevels,
  heatmapColumns,
  niceMax,
  weekdayMon0,
} from "@/lib/stats/calendar";

describe("weekdays", () => {
  it("weekday is Monday-based", () => {
    expect(weekdayMon0("2026-11-02")).toBe(0); // Monday
    expect(weekdayMon0("2026-11-06")).toBe(4); // Friday
    expect(weekdayMon0("2026-11-08")).toBe(6); // Sunday
  });

});

describe("heatmap", () => {
  it("lays out Mon–Sun columns ending with the current week", () => {
    const cols = heatmapColumns("2026-11-06", 53);
    expect(cols).toHaveLength(53);
    expect(cols.at(-1)![0]).toBe("2026-11-02");
    expect(cols.at(-1)![4]).toBe("2026-11-06");
    expect(cols[0]![0]).toBe("2025-11-03");
  });

  it("maps counts to levels by quantile; zero stays empty", () => {
    const level = heatLevels([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 200]);
    expect(level(0)).toBe(0);
    expect(level(1)).toBe(1);
    expect(level(200)).toBe(5);
    expect(level(5)).toBeGreaterThan(level(2));
    expect(heatLevels([0, 0])(5)).toBe(0);
  });
});

describe("series helpers", () => {
  it("fills dense series and counts", () => {
    const m = countByDay(["2026-11-05", "2026-11-05", "2026-11-06"]);
    expect(denseSeries(m, "2026-11-06", 3)).toEqual([
      { day: "2026-11-04", value: 0 },
      { day: "2026-11-05", value: 2 },
      { day: "2026-11-06", value: 1 },
    ]);
  });

  it("rounds axis maxima to 1/2/5", () => {
    expect([0, 3, 7, 12, 48, 101].map(niceMax)).toEqual([1, 5, 10, 20, 50, 200]);
  });
});
