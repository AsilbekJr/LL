import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { geminiJsonFallback } = await import("@/lib/ai/gemini");
const { aiModels } = await import("@/lib/ai/config");
const J = await import("@/lib/speaking/judge");
const D = await import("@/lib/speaking/dialog");

async function judge(r: Parameters<typeof J.judgeUserMessage>[0]) {
  const raw = await geminiJsonFallback(aiModels("gemini"), {
    system: J.JUDGE_SYSTEM,
    user: J.judgeUserMessage(r),
    schema: J.JUDGE_JSON_SCHEMA,
  });
  const j = J.judgeSchema.parse(JSON.parse(raw));
  console.log(r.said, "=>", J.judgePassed(j), JSON.stringify(j));
  return j;
}

describe("live speaking judge", () => {
  const sleepy = { english: "sleepy", uzbek: "uyqusiragan" };
  it("fails a restart and a nonsense sentence", async () => {
    const j = await judge({
      kind: "pattern",
      said: "it's so it's too sleepy for me",
      word: sleepy,
      prompt: "It's too ___ for me.",
      level: "A2",
    });
    expect(J.judgePassed(j)).toBe(false);
  }, 60_000);

  it("passes a good pattern sentence", async () => {
    const j = await judge({
      kind: "pattern",
      said: "this movie is too boring for me",
      word: { english: "boring", uzbek: "zerikarli" },
      prompt: "It's too ___ for me.",
      level: "A2",
    });
    expect(J.judgePassed(j)).toBe(true);
  }, 60_000);

  it("accepts a correct paraphrase in translation", async () => {
    const j = await judge({
      kind: "translation",
      said: "I am going to the shop tomorrow",
      word: { english: "shop", uzbek: "do'kon" },
      prompt: "Ertaga do'konga boraman.",
      reference: "I will go to the store tomorrow.",
      level: "A1",
    });
    expect(J.judgePassed(j)).toBe(true);
  }, 60_000);

  it("fails a grammar mistake", async () => {
    const j = await judge({
      kind: "dialog",
      said: "yesterday I go to the shop and buyed bread",
      word: { english: "buy", uzbek: "sotib olmoq" },
      prompt: "What did you do yesterday?",
      level: "A2",
    });
    expect(J.judgePassed(j)).toBe(false);
    expect(j.grammar_ok).toBe(false);
  }, 60_000);
});

describe("live speaking dialog", () => {
  it("asks a question that invites the word without saying it", async () => {
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: D.DIALOG_SYSTEM,
      user: D.dialogUserMessage({
        level: "A2",
        word: { english: "umbrella", uzbek: "soyabon" },
        history: [],
      }),
      schema: D.DIALOG_JSON_SCHEMA,
    });
    const t = D.dialogTurnSchema.parse(JSON.parse(raw));
    console.log(JSON.stringify(t));
    expect(t.question.toLowerCase()).not.toContain("umbrella");
  }, 60_000);
});
