import { describe, expect, it } from "vitest";
import { reminderMessage } from "../../supabase/functions/send-reminders/message";
import { groupReviewed } from "@/lib/stats/api";

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

describe("calendar day: reviewed items", () => {
  const item = (english: string) => ({
    direction: "en_uz" as const,
    items: { english, uzbek: `${english}-uz` },
  });

  it("one row per card with the last grade and number of answers", () => {
    const r = groupReviewed([
      { card_id: "a", result: "again", reviewed_at: "1", cards: item("reliable") },
      { card_id: "b", result: "good", reviewed_at: "2", cards: item("tired") },
      { card_id: "a", result: "good", reviewed_at: "3", cards: item("reliable") },
    ]);
    expect(r.items).toEqual([
      {
        cardId: "a",
        english: "reliable",
        uzbek: "reliable-uz",
        direction: "en_uz",
        overdueDays: 0,
        lastResult: "good",
        answers: 2,
      },
      {
        cardId: "b",
        english: "tired",
        uzbek: "tired-uz",
        direction: "en_uz",
        overdueDays: 0,
        lastResult: "good",
        answers: 1,
      },
    ]);
    expect(r.truncated).toBe(false);
  });

  it("skips logs of deleted items and reports truncation", () => {
    const logs = [
      { card_id: "x", result: "good" as const, reviewed_at: "1", cards: null },
      ...["a", "b", "c"].map((id) => ({
        card_id: id,
        result: "good" as const,
        reviewed_at: "2",
        cards: item(id),
      })),
    ];
    const r = groupReviewed(logs, 2);
    expect(r.items).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });
});
