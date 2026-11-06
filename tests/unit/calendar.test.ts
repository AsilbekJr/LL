import { describe, expect, it } from "vitest";
import {
  countByDay,
  dayStatus,
  denseSeries,
  heatLevels,
  heatmapColumns,
  monthEnd,
  monthGrid,
  niceMax,
  shiftMonth,
  weekdayMon0,
} from "@/lib/stats/calendar";

describe("month helpers", () => {
  it("weekday is Monday-based", () => {
    expect(weekdayMon0("2026-11-02")).toBe(0); // Monday
    expect(weekdayMon0("2026-11-06")).toBe(4); // Friday
    expect(weekdayMon0("2026-11-08")).toBe(6); // Sunday
  });

  it("month end and shift", () => {
    expect(monthEnd("2026-02-10")).toBe("2026-02-28");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(shiftMonth("2026-11-06", 1)).toBe("2026-12-01");
    expect(shiftMonth("2026-01-31", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-11-06", 2)).toBe("2027-01-01");
  });

  it("builds a Monday-first grid with padding", () => {
    const g = monthGrid("2026-11-06"); // Nov 2026 starts on Sunday
    expect(g[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.at(-1)!.at(-1)).toBeNull();
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

describe("dayStatus", () => {
  const today = "2026-11-06";
  it("classifies past, today and future", () => {
    expect(dayStatus("2026-11-01", today, undefined)).toBe("rest");
    expect(dayStatus("2026-11-01", today, { due: 10, done: 10, missed: 0 })).toBe("done");
    expect(dayStatus("2026-11-01", today, { due: 10, done: 4, missed: 6 })).toBe("partial");
    expect(dayStatus("2026-11-01", today, { due: 10, done: 0, missed: 10 })).toBe("missed");
    expect(dayStatus(today, today, { due: 0, done: 12, missed: 0 })).toBe("done");
    expect(dayStatus(today, today, { due: 5, done: 3, missed: 0 })).toBe("partial");
    expect(dayStatus(today, today, { due: 5, done: 0, missed: 0 })).toBe("planned");
    expect(dayStatus("2026-11-09", today, { due: 7, done: 0, missed: 0 })).toBe("planned");
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
