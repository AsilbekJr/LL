import { describe, expect, it } from "vitest";
import {
  daysUntilStory,
  highlightWords,
  maskPart,
  missingWords,
  offlineRetellScore,
  pickStoryWords,
  retellLongEnough,
  retellRequestSchema,
  retellUserMessage,
  retellWordsUsed,
  storyLevel,
  storyReplySchema,
  storyRequestSchema,
  storyUserMessage,
  storyWeek,
  weekday,
  weekStartOf,
  type WeekWordCandidate,
} from "@/lib/story/story";

const W = (id: string, english: string, extra: Partial<WeekWordCandidate> = {}): WeekWordCandidate => ({
  id,
  english,
  uzbek: `${english}-uz`,
  type: "word",
  reviews: 1,
  added: false,
  ...extra,
});

describe("weeks", () => {
  it("knows weekdays and week starts (Monday)", () => {
    expect(weekday("2026-11-23")).toBe(0); // Monday
    expect(weekday("2026-11-29")).toBe(6); // Sunday
    expect(weekStartOf("2026-11-25")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-29")).toBe("2026-11-23");
  });

  it("opens this week's story on the weekend, else offers last week's", () => {
    expect(storyWeek("2026-11-28")).toEqual({ weekStart: "2026-11-23", current: true }); // Saturday
    expect(storyWeek("2026-11-29")).toEqual({ weekStart: "2026-11-23", current: true }); // Sunday
    expect(storyWeek("2026-11-25")).toEqual({ weekStart: "2026-11-16", current: false }); // Wednesday
    expect(daysUntilStory("2026-11-25")).toBe(3);
    expect(daysUntilStory("2026-11-28")).toBe(0);
  });
});

describe("week words", () => {
  it("puts not-yet-active words first, then the most practised; skips sentences and repeats", () => {
    const picked = pickStoryWords(
      [
        W("1", "sink", { reviews: 1 }),
        W("2", "postpone", { reviews: 5 }),
        W("3", "reliable", { reviews: 9 }),
        W("4", "I'll be back.", { type: "sentence", reviews: 20 }),
        W("5", "Sink", { reviews: 3 }),
      ],
      new Map([["3", 3]]),
      3,
      10,
    );
    expect(picked.map((w) => w.english)).toEqual(["postpone", "sink", "reliable"]);
  });

  it("caps by the level", () => {
    const many = Array.from({ length: 20 }, (_, i) => W(String(i), `word${i}`));
    expect(pickStoryWords(many, new Map(), 3, storyLevel("beginner").maxWords)).toHaveLength(6);
  });
});

describe("story", () => {
  const words = [
    { id: "00000000-0000-4000-8000-000000000001", english: "sink", uzbek: "rakovina" },
    { id: "00000000-0000-4000-8000-000000000002", english: "give up", uzbek: "taslim bo'lmoq" },
  ];
  const body = {
    title_uz: "",
    parts: [
      { en: "Aziz washed the cups in the sink.", uz: "..." },
      { en: "The water was cold, but he never gave up.", uz: "..." },
    ],
    outline_uz: ["Aziz idish yuvdi", "U taslim bo'lmadi"],
  };

  it("validates requests and replies, and describes the level to the AI", () => {
    const req = storyRequestSchema.parse({
      weekStart: "2026-11-23",
      level: "ielts",
      words: [...words, { ...words[0]!, id: "00000000-0000-4000-8000-000000000003" }],
    });
    expect(storyUserMessage(req)).toContain("IELTS");
    expect(storyUserMessage(req)).toContain('"give up"');
    expect(storyRequestSchema.safeParse({ weekStart: "2026-11-23", level: "ielts", words }).success).toBe(
      false,
    );
    expect(storyReplySchema.safeParse({ title: "A day", ...body }).success).toBe(true);
  });

  it("finds target words that did not make it into the story", () => {
    expect(missingWords(body, words)).toEqual([]);
    expect(missingWords({ parts: [{ en: "Nothing here.", uz: "" }] }, words)).toHaveLength(2);
  });

  it("highlights words and phrases in any form", () => {
    const segs = highlightWords("He never gave up, so the sink was clean.", words);
    expect(segs.filter((s) => s.word).map((s) => s.text)).toEqual(["gave up", "sink"]);
    expect(segs.map((s) => s.text).join("")).toBe("He never gave up, so the sink was clean.");
  });

  it("hides the text step by step", () => {
    const text = "Aziz washed the cups in the sink.";
    expect(maskPart(text, 0, ["sink"])).toBe(text);
    expect(maskPart(text, 1, ["sink"])).toBe("A___ w_____ t__ c___ i_ t__ s___.");
    expect(maskPart(text, 2, ["sink"])).toBe("____ ______ ___ ____ __ ___ sink.");
    expect(maskPart(text, 3, ["sink"])).toBe("");
  });
});

describe("retelling", () => {
  const words = [
    { id: "a", english: "sink", uzbek: "rakovina" },
    { id: "b", english: "give up", uzbek: "taslim bo'lmoq" },
  ];
  const story = "Aziz washed the cups in the sink. The water was cold, but he never gave up.";

  it("counts words from the AI list only when heard, or every heard word without AI", () => {
    const said = "Aziz washed cups in the sink and he did not give up";
    expect([...retellWordsUsed(said, words, null)]).toEqual(["a", "b"]);
    const ai = { points: [true, true], words_ok: ["sink"], score: 80, fixes: [], feedback_uz: "" };
    expect([...retellWordsUsed(said, words, ai)]).toEqual(["a"]);
  });

  it("scores offline from content and words", () => {
    expect(offlineRetellScore(story, story, words)).toBe(100);
    expect(offlineRetellScore("hello there my friend", story, words)).toBeLessThan(20);
  });

  it("needs a real retelling and builds the AI message", () => {
    expect(retellLongEnough("too short")).toBe(false);
    const req = retellRequestSchema.parse({
      level: "A2",
      title: "A day",
      story,
      outline: ["Aziz idish yuvdi"],
      words,
      said: "Aziz washed the cups",
    });
    expect(retellUserMessage(req)).toContain("<transcript>");
  });
});
