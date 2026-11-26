import { describe, expect, it } from "vitest";
import { reminderMessage } from "../../supabase/functions/send-reminders/message";

describe("push reminder text", () => {
  it("mentions overdue reviews", () => {
    expect(reminderMessage(24, 5)).toEqual({
      title: "LL — takrorlash vaqti",
      body: "Bugun 24 ta takrorlash, 5 tasi kechikkan",
      url: "/bugun",
      tag: "ll-reminder",
    });
  });

  it("without overdue", () => {
    expect(reminderMessage(3, 0).body).toBe("Bugun 3 ta takrorlash sizni kutmoqda");
  });
});
