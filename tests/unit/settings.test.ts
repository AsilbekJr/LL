import { describe, expect, it } from "vitest";
import { isValidTimeZone, normalizeTime, parseLadder, settingsFormSchema } from "@/lib/schemas/settings";

const valid = {
  daily_new_limit: "15",
  daily_review_limit: "150",
  ladder: "1, 3, 7, 12, 20, 35, 60, 100",
  srs_mode: "ladder" as const,
  direction_mode: "random" as const,
  overdue_penalty: true,
  production_gate_steps: "3",
  maintenance_days: "180",
  tts_rate: "1",
  tts_voice: "",
  timezone: "Asia/Tashkent",
  reminder_times: ["20:00", "8:00", "", "08:00"],
};

describe("settings schema", () => {
  it("parses and normalizes a valid form", () => {
    const r = settingsFormSchema.parse(valid);
    expect(r).toMatchObject({
      daily_new_limit: 15,
      ladder: [1, 3, 7, 12, 20, 35, 60, 100],
      production_gate_steps: 3,
      tts_voice: null,
      reminder_times: ["08:00", "20:00"],
    });
  });

  it("rejects a bad ladder, limits, time zone and reminders", () => {
    expect(settingsFormSchema.safeParse({ ...valid, ladder: "5, 3" }).success).toBe(false);
    // A blank number field is an error, never a silent 0 (it once zeroed the daily new-word limit).
    expect(settingsFormSchema.safeParse({ ...valid, daily_new_limit: "" }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...valid, daily_new_limit: "  " }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...valid, daily_new_limit: "0" }).success).toBe(true);
    expect(settingsFormSchema.safeParse({ ...valid, daily_new_limit: "-1" }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...valid, timezone: "Mars/Base" }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ ...valid, reminder_times: ["25:00"] }).success).toBe(false);
    expect(
      settingsFormSchema.safeParse({
        ...valid,
        reminder_times: ["07:00", "08:00", "09:00", "10:00", "11:00"],
      }).success,
    ).toBe(false);
  });

  it("keeps the production gate below the ladder length", () => {
    const r = settingsFormSchema.safeParse({ ...valid, ladder: "1, 3, 7", production_gate_steps: "3" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["production_gate_steps"]);
  });
});

describe("helpers", () => {
  it("parses ladders with any separator", () => {
    expect(parseLadder("1 3;7,12")).toEqual([1, 3, 7, 12]);
    expect(() => parseLadder("1, a")).toThrow();
    expect(() => parseLadder("1")).toThrow();
  });

  it("normalizes times", () => {
    expect(normalizeTime("8:00")).toBe("08:00");
    expect(normalizeTime("08:00:00")).toBe("08:00");
    expect(normalizeTime("24:00")).toBeNull();
    expect(normalizeTime("noon")).toBeNull();
  });

  it("validates time zones", () => {
    expect(isValidTimeZone("Asia/Tashkent")).toBe(true);
    expect(isValidTimeZone("Nope/Nowhere")).toBe(false);
  });
});
