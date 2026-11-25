import { describe, expect, it } from "vitest";
import { countsAsActive, HELP_MODEL, helpOf, sentenceStart, withHelp } from "@/lib/speaking/help";
import { dialogTurnSchema } from "@/lib/speaking/dialog";

describe("help ladder", () => {
  it("encodes the help step in the context and reads it back", () => {
    expect(withHelp("dialog", 0)).toBe("dialog");
    expect(withHelp("dialog", 3)).toBe("dialog:h3");
    expect(withHelp("dialog", 9)).toBe("dialog:h4");
    expect(helpOf("dialog:h3")).toBe(3);
    expect(helpOf("dialog")).toBe(0);
    expect(helpOf(null)).toBe(0);
    expect(helpOf("fix:3f2a-uuid")).toBe(0);
  });

  it("does not count answers said after the model as active", () => {
    expect(countsAsActive(null)).toBe(true);
    expect(countsAsActive("dialog:h3")).toBe(true);
    expect(countsAsActive(withHelp("translation", HELP_MODEL))).toBe(false);
  });

  it("gives the first words of a sentence, never the target word", () => {
    expect(sentenceStart("I usually go to work by bus.")).toBe("I usually …");
    expect(sentenceStart("Postpone the meeting until Friday please.", "postpone")).toBeNull();
    expect(sentenceStart("We had to postpone the trip because of rain.", "postpone")).toBe("We had to …");
    expect(sentenceStart("Hi there")).toBeNull();
  });

  it("accepts dialog turns without the new help fields", () => {
    const turn = dialogTurnSchema.parse({ question: "Q?", question_uz: "S?", hint_uz: "H" });
    expect(turn.model_answer).toBe("");
    expect(turn.collocation).toBe("");
  });
});
