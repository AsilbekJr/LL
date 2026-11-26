import { describe, expect, it } from "vitest";
import { summaryWeek, weeklySummary } from "@/lib/production/weekly";

// 2026-11-23 is a Monday. Noon Tashkent = 07:00Z.
const at = (day: string) => `${day}T07:00:00Z`;

describe("weekly summary", () => {
  it("sums up this week on the weekend and last week on Monday", () => {
    expect(summaryWeek("2026-11-28")).toBe("2026-11-23"); // Saturday
    expect(summaryWeek("2026-11-29")).toBe("2026-11-23"); // Sunday
    expect(summaryWeek("2026-11-30")).toBe("2026-11-23"); // Monday
    expect(summaryWeek("2026-11-25")).toBeNull(); // Wednesday
  });

  it("finds words that became active this week, uses and the favourite", () => {
    const uses = [
      // "a": active on its 3rd day, which is this week.
      { item_id: "a", created_at: at("2026-11-20") },
      { item_id: "a", created_at: at("2026-11-22") },
      { item_id: "a", created_at: at("2026-11-24") },
      // "b": became active last week; used twice this week.
      { item_id: "b", created_at: at("2026-11-17") },
      { item_id: "b", created_at: at("2026-11-18") },
      { item_id: "b", created_at: at("2026-11-19") },
      { item_id: "b", created_at: at("2026-11-25") },
      { item_id: "b", created_at: at("2026-11-26") },
      // next week: ignored
      { item_id: "c", created_at: at("2026-12-01") },
    ];
    const s = weeklySummary(uses, "2026-11-23", "Asia/Tashkent");
    expect(s.newlyActive).toEqual(["a"]);
    expect(s.uses).toBe(3);
    expect(s.top).toEqual({ itemId: "b", count: 2 });
  });

  it("is empty for a quiet week", () => {
    expect(weeklySummary([], "2026-11-23")).toEqual({
      weekStart: "2026-11-23",
      newlyActive: [],
      uses: 0,
      top: null,
    });
  });
});
