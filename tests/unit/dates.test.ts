import { describe, expect, it } from "vitest";
import { dayInTz, todayInTz } from "@/lib/srs/dates";

// Vitest runs with TZ=America/New_York (see vitest.config.ts) to prove the
// result never depends on the host timezone.
describe("Asia/Tashkent day boundaries (UTC+5)", () => {
  it("23:59:59 Tashkent is still the same day", () => {
    // 2026-11-06 23:59:59 +05:00 == 18:59:59Z
    expect(dayInTz(new Date("2026-11-06T18:59:59Z"))).toBe("2026-11-06");
  });

  it("00:00 Tashkent is already the next day", () => {
    // 2026-11-07 00:00:00 +05:00 == 19:00:00Z on the 6th (UTC)
    expect(dayInTz(new Date("2026-11-06T19:00:00Z"))).toBe("2026-11-07");
  });

  it("early-morning UTC belongs to the Tashkent day", () => {
    expect(dayInTz(new Date("2026-11-06T00:30:00Z"))).toBe("2026-11-06"); // 05:30 Tashkent
  });

  it("handles month / year rollover", () => {
    expect(dayInTz(new Date("2026-12-31T19:00:00Z"))).toBe("2027-01-01");
  });

  it("todayInTz uses the provided clock", () => {
    expect(todayInTz("Asia/Tashkent", new Date("2026-11-06T19:30:00Z"))).toBe("2026-11-07");
    expect(todayInTz("UTC", new Date("2026-11-06T19:30:00Z"))).toBe("2026-11-06");
  });
});
