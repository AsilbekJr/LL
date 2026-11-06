import { describe, expect, it } from "vitest";
import { checkProduction, usesTerm, wordForms, wordSimilarity, wordTokens } from "@/lib/text/usage";

describe("wordForms", () => {
  it("covers regular inflections", () => {
    expect([...wordForms("work")]).toEqual(expect.arrayContaining(["works", "worked", "working"]));
    expect([...wordForms("apply")]).toEqual(expect.arrayContaining(["applies", "applied", "applying"]));
    expect([...wordForms("improve")]).toEqual(expect.arrayContaining(["improves", "improved", "improving"]));
    expect([...wordForms("watch")]).toEqual(expect.arrayContaining(["watches", "watched"]));
    expect([...wordForms("stop")]).toEqual(expect.arrayContaining(["stopped", "stopping"]));
    expect([...wordForms("lie")]).toContain("lying");
  });

  it("covers irregular verbs", () => {
    expect([...wordForms("get")]).toEqual(expect.arrayContaining(["got", "gotten", "getting"]));
    expect([...wordForms("break")]).toEqual(expect.arrayContaining(["broke", "broken"]));
  });
});

describe("usesTerm", () => {
  it("finds single words in any form", () => {
    expect(usesTerm("She improved her English a lot.", "improve")).toBe(true);
    expect(usesTerm("Two tickets, please.", "ticket")).toBe(true);
    expect(usesTerm("I'm borrowing a pen.", "borrow")).toBe(true);
    expect(usesTerm("Prices were cheap.", "expensive")).toBe(false);
  });

  it("matches whole words only", () => {
    expect(usesTerm("The carpet is red.", "car")).toBe(false);
  });

  it("matches phrasal verbs and collocations with inflection", () => {
    expect(usesTerm("We got lost near the station.", "get lost")).toBe(true);
    expect(usesTerm("He gave up smoking.", "to give up")).toBe(true);
    expect(usesTerm("They are setting up a company.", "set up")).toBe(true);
    expect(usesTerm("He gave smoking up.", "give up")).toBe(false); // split phrasal verb not accepted
  });

  it("fills placeholder words", () => {
    expect(usesTerm("Take his advice with a grain of salt.", "take something with a grain of salt")).toBe(
      true,
    );
    expect(usesTerm("Who let the cat out of the bag?", "let the cat out of the bag")).toBe(true);
  });

  it("ignores parenthesised hints and apostrophe style", () => {
    expect(usesTerm("I’m tired.", "tired")).toBe(true);
    expect(usesTerm("It is on time", "on time (punctual)")).toBe(true);
  });
});

describe("checkProduction", () => {
  it("passes a real sentence that uses the word", () => {
    expect(checkProduction("I booked a room for two nights.", "book a room")).toEqual({
      used: true,
      wordCount: 7,
      longEnough: true,
      passed: true,
    });
  });

  it("fails too-short or unrelated answers", () => {
    expect(checkProduction("A ticket.", "ticket").passed).toBe(false);
    expect(checkProduction("I like coffee very much.", "ticket").passed).toBe(false);
  });
});

describe("wordSimilarity", () => {
  it("scores repeated sentences", () => {
    expect(wordSimilarity("Nice to meet you", "Nice to meet you.")).toBe(1);
    expect(wordSimilarity("nice to see you", "Nice to meet you")).toBe(0.75);
    expect(wordSimilarity("", "Nice to meet you")).toBe(0);
  });

  it("tokenizes", () => {
    expect(wordTokens("It's well-known, isn’t it?")).toEqual(["it's", "well-known", "isn't", "it"]);
  });
});
