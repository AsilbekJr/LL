import { describe, expect, it } from "vitest";
import { checkPyramidStep, keptShare, PYRAMID_STEPS, pyramidPrompt } from "@/lib/speaking/pyramid";
import { judgeRequestSchema, judgeUserMessage } from "@/lib/speaking/judge";

const W = "postpone";
const base = "I postponed the meeting.";
const when = "I postponed the meeting until Friday.";
const why = "I postponed the meeting until Friday because my boss was sick.";
const but = "I postponed the meeting until Friday because my boss was sick, but the client wasn't happy.";

describe("sentence pyramid", () => {
  it("has five steps in order", () => {
    expect(PYRAMID_STEPS).toEqual(["base", "when", "why", "but", "turn"]);
  });

  it("passes a sentence that grows correctly at every step", () => {
    expect(checkPyramidStep(base, "base", null, W).passed).toBe(true);
    expect(checkPyramidStep(when, "when", base, W).passed).toBe(true);
    expect(checkPyramidStep(why, "why", when, W).passed).toBe(true);
    expect(checkPyramidStep(but, "but", why, W).passed).toBe(true);
    expect(checkPyramidStep("Why did you postpone the meeting until Friday?", "turn", but, W).passed).toBe(
      true,
    );
    expect(
      checkPyramidStep("I didn't postpone the meeting until Friday because my boss was sick.", "turn", but, W)
        .passed,
    ).toBe(true);
  });

  it("fails when the word is missing or the sentence is too short", () => {
    expect(checkPyramidStep("I moved the meeting.", "base", null, W).used).toBe(false);
    expect(checkPyramidStep("Postpone it", "base", null, W).grew).toBe(false);
  });

  it("fails when the previous sentence is dropped or nothing is added", () => {
    const fresh = checkPyramidStep("We postponed our trip to Samarkand.", "when", base, W);
    expect(fresh.kept).toBe(false);
    expect(checkPyramidStep(base, "when", base, W).grew).toBe(false);
  });

  it("requires the step's connector or form", () => {
    expect(checkPyramidStep(`${when} and it was fine`, "why", when, W).marker).toBe(false);
    expect(checkPyramidStep(`${why} and he called me`, "but", why, W).marker).toBe(false);
    expect(checkPyramidStep(but, "turn", but, W).marker).toBe(false);
  });

  it("measures how much of the previous sentence is kept", () => {
    expect(keptShare(when, base)).toBe(1);
    expect(keptShare("hello", base)).toBe(0);
  });

  it("sends the step task to the judge", () => {
    const req = judgeRequestSchema.parse({
      kind: "pyramid",
      said: when,
      word: { english: W, uzbek: "kechiktirmoq" },
      prompt: pyramidPrompt("when", base),
    });
    const msg = judgeUserMessage(req);
    expect(msg).toContain("sentence-building step");
    expect(msg).toContain(base);
  });
});

describe("pyramid word", () => {
  it("strips the bracket and reads the word class", async () => {
    const { pyramidTerm } = await import("@/lib/speaking/pyramid");
    expect(pyramidTerm({ english: "sink(noun)" })).toEqual({ term: "sink", wordClass: "noun" });
    expect(pyramidTerm({ english: "sink", part_of_speech: "verb" })).toEqual({
      term: "sink",
      wordClass: "verb",
    });
    expect(pyramidTerm({ english: "give up", type: "phrase", part_of_speech: "verb" }).wordClass).toBe(
      "other",
    );
    expect(pyramidTerm({ english: "deadline" })).toEqual({ term: "deadline", wordClass: "other" });
  });

  it("hears a bracketed word without the bracket", async () => {
    const { checkPyramidStep } = await import("@/lib/speaking/pyramid");
    expect(checkPyramidStep("I washed the cups in the sink.", "base", null, "sink(noun)").passed).toBe(true);
  });
});

describe("pyramid builder", () => {
  it("builds offline help from an example sentence", async () => {
    const { builderFromExample } = await import("@/lib/speaking/pyramid");
    const b = builderFromExample("Would you put the dishes in the sink?", "sink")!;
    expect(b.model).toBe("Would you put the dishes in the sink?");
    expect(b.chunks).toEqual(["in the sink"]);
    expect(b.starter).toBe("Would you put …");
    expect(b.situation_uz).toBe("");
    expect(builderFromExample(null, "sink")).toBeNull();
  });

  it("validates builder requests and replies", async () => {
    const { builderRequestSchema, builderSchema, builderUserMessage } =
      await import("@/lib/speaking/pyramid");
    const req = builderRequestSchema.parse({
      level: "A2",
      word: { english: "sink", uzbek: "rakovina" },
      wordClass: "noun",
    });
    expect(builderUserMessage(req)).toContain('"sink" (noun');
    expect(builderSchema.parse({}).chunks).toEqual([]);
  });
});
