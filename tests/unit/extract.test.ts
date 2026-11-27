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
  E("pick up", "A2", "phrasal verb"),
  E("pick", "A1", "verb"),
  E("Paris", "A1"),
  E("abandon", "C1", "verb"),
  E("like", "A1", "conjunction/preposition/verb"),
  E("the", "A1", "determiner"),
  E("turn down", "B1", "phrasal verb"),
  E("turn", "A1", "verb"),
  E("music", "A1"),
  E("look up", "B1", "phrasal verb"),
  E("look", "A1", "verb"),
  E("sky", "A1"),
  E("make up one's mind", "B1", "phrase"),
  E("IT", "B1", "noun"),
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

describe("phrasal verbs and phrases", () => {
  it("finds separated phrasal verbs, but not a verb and a preposition", () => {
    const found = extractWords(
      "Please pick it up. She turned the music down. We looked at the sky up there.",
      index,
    ).map((w) => w.entry.english);
    expect(found).toContain("pick up");
    expect(found).toContain("turn down");
    expect(found).not.toContain("look up");
  });

  it("matches phrases with a placeholder and keeps 'like' as a verb", () => {
    const found = extractWords("Finally I made up my mind. I like music.", index).map((w) => w.entry.english);
    expect(found).toContain("make up one's mind");
    expect(found).toContain("like");
    expect(found).not.toContain("the");
  });

  it("marks a separated phrasal verb from verb to particle", () => {
    expect(markInSentence("She turned the music down again.", "turn down")).toEqual([
      "She ",
      "turned the music down",
      " again.",
    ]);
  });

  it("knows an abbreviation only in capitals", () => {
    expect(extractWords("Pick it up.", index).map((w) => w.entry.english)).not.toContain("IT");
    expect(extractWords("She works in IT now.", index).map((w) => w.entry.english)).toContain("IT");
  });
});
