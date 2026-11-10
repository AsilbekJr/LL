import { describe, expect, it } from "vitest";
import { sharedWord } from "@/lib/items/shared-text";

describe("text shared into the app", () => {
  it("takes a selected word and drops quotes and closing punctuation", () => {
    expect(sharedWord({ text: "“breakdown.”" })).toBe("breakdown");
    expect(sharedWord({ text: "  break the ice, " })).toBe("break the ice");
  });

  it("drops the page address browsers append", () => {
    expect(sharedWord({ text: '"reluctant" https://example.com/article?id=1', title: "Some article" })).toBe(
      "reluctant",
    );
  });

  it("keeps a sentence's punctuation", () => {
    expect(sharedWord({ text: "It is raining cats and dogs." })).toBe("It is raining cats and dogs.");
  });

  it("falls back to the title, and to nothing for a bare link", () => {
    expect(sharedWord({ text: "https://example.com", title: "Idioms" })).toBe("Idioms");
    expect(sharedWord({ text: "https://example.com" })).toBe("");
    expect(sharedWord({})).toBe("");
  });

  it("collapses line breaks and limits the length", () => {
    expect(sharedWord({ text: "give\n  up" })).toBe("give up");
    expect(sharedWord({ text: "a ".repeat(600) }).length).toBeLessThanOrEqual(500);
  });
});
