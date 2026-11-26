import { describe, expect, it } from "vitest";
import { buildIndex, extractWords, markInSentence, splitSentences, wordsForLevel } from "@/lib/text/extract";
import type { VocabEntry } from "@/lib/vocab/dictionary";

const E = (
  english: string,
  level: VocabEntry["level"],
  pos = "noun",
  uzbek = `${english}-uz`,
): VocabEntry => ({
  english,
  uzbek,
  pos,
  level,
});

const dict = [
  E("go", "A1", "verb"),
  E("wash", "A1", "verb"),
  E("cup", "A1"),
  E("sink", "A2"),
  E("postpone", "B1", "verb"),
  E("reliable", "B2", "adjective"),
  E("meeting", "A2"),
  E("because", "A1", "conjunction"),
  E("because of", "B1", "preposition/adverb"),
  E("pick up", "A2", "verb"),
  E("pick", "A1", "verb"),
  E("Paris", "A1"),
  E("abandon", "C1", "verb"),
];
const index = buildIndex(dict);

const text = `Yesterday I washed the cups in the sink. We postponed the meeting because of the rain.
Anna went to Paris to pick up a reliable car, and the meeting was postponed again!`;

describe("words from a text", () => {
  it("splits sentences and lines", () => {
    expect(splitSentences("One. Two!\nThree")).toEqual(["One.", "Two!", "Three"]);
  });

  it("finds inflected words and phrases, skips grammar words and names", () => {
    const found = extractWords(text, index);
    const words = found.map((w) => w.entry.english).sort();
    expect(words).toEqual(
      ["cup", "go", "meeting", "pick up", "postpone", "reliable", "sink", "wash", "because of"].sort(),
    );
    const meeting = found.find((w) => w.entry.english === "meeting")!;
    expect(meeting.count).toBe(2);
    expect(meeting.sentence).toBe("We postponed the meeting because of the rain.");
    // "Paris" after a capital mid-sentence is a name; "because" alone is grammar.
    expect(words).not.toContain("Paris");
    expect(words).not.toContain("because");
  });

  it("keeps the chosen level and one above, most frequent first", () => {
    const found = extractWords(text, index);
    expect(wordsForLevel(found, "A2").map((w) => w.entry.english)).toEqual([
      "postpone",
      "meeting",
      "sink",
      "because of",
      "pick up",
    ]);
    expect(wordsForLevel(found, "B2").map((w) => w.entry.english)).toEqual(["reliable"]);
    expect(wordsForLevel(found, "B2", true).length).toBe(found.length);
  });

  it("marks the word in its sentence", () => {
    expect(markInSentence("We postponed the meeting.", "postpone")).toEqual([
      "We ",
      "postponed",
      " the meeting.",
    ]);
    expect(markInSentence("Nothing here.", "postpone")).toBeNull();
  });
});
