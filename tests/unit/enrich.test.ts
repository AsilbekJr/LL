import { describe, expect, it } from "vitest";
import { bankSentence, findEntry, mergeDetails, pairExample, wantsDetails } from "@/lib/items/enrich";
import type { TranslationPrompt } from "@/lib/vocab/sentences";
import type { VocabEntry } from "@/lib/vocab/dictionary";

const prompts: TranslationPrompt[] = [
  { english: "I have a very long and difficult book to read.", uzbek: "uzun", level: "A1", words: [] },
  { english: "This book is mine.", uzbek: "Bu kitob meniki.", level: "A1", words: [] },
  { english: "The bookshop is closed.", uzbek: "Do'kon yopiq.", level: "A1", words: [] },
  { english: "A short book.", uzbek: "Qisqa kitob.", level: "B2", words: [] },
];

const ai = {
  english: "book",
  part_of_speech: "verb",
  example_en: "I want to book a room.",
  example_uz: "Men xona band qilmoqchiman.",
  notes: "'book a ticket' deb ishlatiladi.",
};

describe("auto details: offline sources", () => {
  it("picks the shortest pair with the exact word, not above the level", () => {
    expect(pairExample("book", prompts, "A1")?.english).toBe("This book is mine.");
    expect(pairExample("book", prompts, null)?.english).toBe("A short book.");
    expect(pairExample("library", prompts, "A1")).toBeNull();
  });

  it("does not match a word inside a longer word", () => {
    expect(bankSentence("book", ["The bookshop is closed.", "Read the book."])).toBe("Read the book.");
  });

  it("finds a dictionary entry case- and space-insensitively", () => {
    const entries: VocabEntry[] = [{ english: "give up", uzbek: "taslim bo'lmoq", pos: "verb", level: "B1" }];
    expect(findEntry("  Give  Up ", entries)?.level).toBe("B1");
  });

  it("skips sentences", () => {
    expect(wantsDetails({ english: "I have never been to London before." })).toBe(false);
    expect(wantsDetails({ english: "break the ice" })).toBe(true);
  });
});

describe("auto details: merging", () => {
  const empty = { part_of_speech: "", example_en: "", example_uz: "", notes: "" };

  it("fills empty fields, preferring the AI example pair", () => {
    const local = {
      part_of_speech: "noun/verb",
      example_en: "This book is mine.",
      example_uz: "Bu kitob meniki.",
    };
    expect(mergeDetails(empty, local, ai)).toEqual({
      part_of_speech: "verb",
      example_en: "I want to book a room.",
      example_uz: "Men xona band qilmoqchiman.",
      notes: "'book a ticket' deb ishlatiladi.",
    });
  });

  it("uses the offline pair when AI is off", () => {
    const local = {
      part_of_speech: "noun",
      example_en: "This book is mine.",
      example_uz: "Bu kitob meniki.",
      cefr_level: "A1" as const,
    };
    expect(mergeDetails(empty, local, null)).toMatchObject({
      part_of_speech: "noun",
      example_en: "This book is mine.",
      example_uz: "Bu kitob meniki.",
      notes: "",
    });
  });

  it("never overwrites what the learner typed", () => {
    const typed = {
      part_of_speech: "noun",
      example_en: "My own sentence.",
      example_uz: "",
      notes: "mening izohim",
    };
    const out = mergeDetails(typed, {}, ai);
    expect(out).toEqual(typed); // their example is kept; AI's translation is for another sentence
  });

  it("translates the learner's example when the AI kept it", () => {
    const typed = { ...empty, example_en: "I want to book a room." };
    expect(mergeDetails(typed, {}, ai).example_uz).toBe("Men xona band qilmoqchiman.");
  });
});
