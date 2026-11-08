import { describe, expect, it } from "vitest";
import {
  accuracy,
  answerCard,
  createSession,
  currentCard,
  isFinished,
  previewIntervals,
  recordProduction,
  remaining,
} from "@/lib/session/engine";
import {
  isProductionPending,
  planExercise,
  shuffle,
  type SessionCard,
  type SessionItem,
} from "@/lib/session/exercise";
import { DEFAULT_SETTINGS, type SrsCard } from "@/lib/srs/types";

const TODAY = "2026-11-06";
const ctx = { settings: DEFAULT_SETTINGS, today: TODAY, now: new Date("2026-11-06T07:00:00Z") };
const DONE = { writtenPassed: true, spokenPassed: true };
const NONE = { writtenPassed: false, spokenPassed: false };

let seed = 1;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

function item(id: string, over: Partial<SessionItem> = {}): SessionItem {
  return {
    id,
    type: "word",
    english: `word-${id}`,
    uzbek: `so'z-${id}`,
    example_en: null,
    example_uz: null,
    part_of_speech: null,
    notes: null,
    ...over,
  };
}

function sc(id: string, card: Partial<SrsCard> = {}, extra: Partial<SessionCard> = {}): SessionCard {
  const it = extra.item ?? item(`i-${id}`);
  return {
    card: {
      id,
      itemId: it.id,
      direction: "en_uz",
      stage: 2,
      ladderStep: 0,
      dueDate: TODAY,
      lapses: 0,
      reps: 0,
      status: "learning",
      fsrsState: null,
      ...card,
    },
    item: it,
    production: DONE,
    siblingComplete: false,
    siblingId: null,
    ...extra,
  };
}

const env = (pool: SessionItem[] = []) => ({
  pool,
  canSpeak: true,
  random: rand,
  gateSteps: 3,
  ladderLength: 8,
});

describe("planExercise", () => {
  const pool = ["a", "b", "c", "d", "e"].map((x) => item(x));

  it("maps stages to exercises", () => {
    expect(planExercise(sc("1", { stage: 1, status: "new" }), env(pool)).kind).toBe("encounter");
    expect(planExercise(sc("1", { stage: 2 }), env(pool)).kind).toBe("choice");
    expect(planExercise(sc("1", { stage: 3 }), env(pool)).kind).toBe("recall");
    expect(planExercise(sc("1", { stage: 4 }), env(pool)).kind).toBe("spelling");
    expect(planExercise(sc("1", { stage: 5 }), env(pool)).kind).toBe("listening");
  });

  it("builds a 4-option multiple choice with the right answer in it", () => {
    const ex = planExercise(sc("1", { stage: 2 }, { item: item("x") }), env(pool));
    if (ex.kind !== "choice") throw new Error(ex.kind);
    expect(ex.options).toHaveLength(4);
    expect(ex.options[ex.correct]).toBe("so'z-x");
    expect(new Set(ex.options).size).toBe(4);
    expect(ex.prompt).toBe("word-x");
  });

  it("uz→en direction asks for the English", () => {
    const ex = planExercise(sc("1", { stage: 2, direction: "uz_en" }, { item: item("x") }), env(pool));
    if (ex.kind !== "choice") throw new Error(ex.kind);
    expect(ex.prompt).toBe("so'z-x");
    expect(ex.options[ex.correct]).toBe("word-x");
  });

  it("falls back when a method is not possible", () => {
    expect(planExercise(sc("1", { stage: 2 }), env([])).kind).toBe("recall"); // no distractors
    expect(planExercise(sc("1", { stage: 5 }), { ...env(pool), canSpeak: false }).kind).toBe("spelling");
    expect(planExercise(sc("1", { stage: 6 }), env(pool)).kind).toBe("spelling"); // no example for cloze
  });

  it("uses the example sentence for cloze and the sentence for word order", () => {
    const withExample = item("t", { english: "ticket", example_en: "I bought a train ticket online." });
    const cl = planExercise(sc("1", { stage: 6 }, { item: withExample }), env(pool));
    expect(cl).toMatchObject({ kind: "cloze", answer: "ticket", before: "I bought a train " });

    const sentence = item("s", {
      type: "sentence",
      english: "Nice to meet you.",
      uzbek: "Tanishganimdan xursandman.",
    });
    const wo = planExercise(sc("1", { stage: 6 }, { item: sentence }), env(pool));
    if (wo.kind !== "order") throw new Error(wo.kind);
    expect([...wo.tokens].sort()).toEqual([...wo.answer].sort());
    expect(wo.tokens.join(" ")).not.toBe(wo.answer.join(" "));
  });

  it("gives a held card the missing production: writing first, then speaking", () => {
    const held = sc("1", { stage: 6, ladderStep: 5 }, { production: NONE });
    expect(isProductionPending(held, env())).toBe(true);
    expect(planExercise(held, env(pool))).toMatchObject({ kind: "write", method: "writing" });
    const halfway = sc(
      "1",
      { stage: 6, ladderStep: 5 },
      { production: { writtenPassed: true, spokenPassed: false } },
    );
    expect(planExercise(halfway, env(pool))).toMatchObject({ kind: "speak", method: "speaking" });
    expect(isProductionPending(sc("1", { stage: 6, ladderStep: 5 }), env())).toBe(false);
  });

  it("shuffle keeps all elements", () => {
    expect(shuffle([1, 2, 3, 4], rand).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("session engine", () => {
  it("walks through the queue and finishes", () => {
    let s = createSession([sc("1"), sc("2")]);
    expect(currentCard(s)?.card.id).toBe("1");
    s = answerCard(s, "good", ctx).state;
    expect(currentCard(s)?.card.id).toBe("2");
    s = answerCard(s, "easy", ctx).state;
    expect(isFinished(s)).toBe(true);
    expect(s.stats).toMatchObject({ good: 1, easy: 1 });
    expect(accuracy(s.stats)).toBe(1);
  });

  it("requeues Again at the end and counts it once in touched", () => {
    let s = createSession([sc("1"), sc("2"), sc("3")]);
    s = answerCard(s, "again", ctx).state;
    expect(s.order).toEqual(["1", "2", "3", "1"]);
    expect(remaining(s)).toBe(3);
    s = answerCard(answerCard(answerCard(s, "good", ctx).state, "good", ctx).state, "good", ctx).state;
    expect(isFinished(s)).toBe(true);
    expect(s.touched).toEqual(["1", "2", "3"]);
    expect(accuracy(s.stats)).toBe(0.75);
  });

  it("brings an encountered card back after a short gap", () => {
    let s = createSession([sc("1", { stage: 1, status: "new" }), sc("2"), sc("3"), sc("4")]);
    const r = answerCard(s, null, ctx);
    s = r.state;
    expect(r.outcome.card).toMatchObject({ stage: 2, status: "learning" });
    expect(s.order).toEqual(["1", "2", "3", "1", "4"]);
    expect(s.stats.seen).toBe(1);
  });

  it("updates the card and the load map", () => {
    const s = answerCard(createSession([sc("1", { ladderStep: 2, status: "review" })]), "good", ctx).state;
    expect(s.byId["1"]!.card).toMatchObject({ ladderStep: 3, dueDate: "2026-11-13" });
    expect(s.load.get("2026-11-13")).toBe(1);
  });

  it("'random': answering one direction moves the deferred other one to tomorrow", () => {
    const a = sc("a", { status: "review", ladderStep: 2 }, { siblingId: "b", deferSibling: true });
    const r = answerCard(createSession([a]), "good", ctx);
    expect(r.siblingPatch).toEqual({ id: "b", dueDate: "2026-11-07", onlyIfDueBy: "2026-11-06" });
    expect(
      answerCard(createSession([sc("c", { status: "review" }, { siblingId: "d" })]), "good", ctx)
        .siblingPatch,
    ).toBeNull();
  });

  it("promotes the sibling when the item becomes mastered", () => {
    const a = sc(
      "a",
      { ladderStep: 7, status: "review", stage: 6 },
      { siblingComplete: true, siblingId: "b" },
    );
    const b = sc(
      "b",
      { ladderStep: 8, status: "review", direction: "uz_en", dueDate: "2027-01-01" },
      { siblingId: "a" },
    );
    const r = answerCard(createSession([a, b]), "good", ctx);
    expect(r.outcome.itemMastered).toBe(true);
    expect(r.siblingPatch).toEqual({ id: "b", status: "mastered", dueDate: "2027-05-05" });
    expect(r.state.byId["b"]!.card.status).toBe("mastered");
  });

  it("marks the sibling's partner complete when this card finishes the ladder", () => {
    const a = sc("a", { ladderStep: 7, status: "review" }, { siblingId: "b" });
    const b = sc("b", { ladderStep: 3, status: "review", direction: "uz_en" }, { siblingId: "a" });
    const r = answerCard(createSession([a, b]), "good", ctx);
    expect(r.outcome.itemMastered).toBe(false);
    expect(r.state.byId["b"]!.siblingComplete).toBe(true);
  });

  it("records a passed production for every card of the item, opening the gate", () => {
    const it = item("w");
    const a = sc(
      "a",
      { stage: 6, ladderStep: 5, status: "review" },
      { item: it, production: { writtenPassed: true, spokenPassed: false } },
    );
    const b = sc(
      "b",
      { direction: "uz_en" },
      { item: it, production: { writtenPassed: true, spokenPassed: false } },
    );
    const other = sc("c", {}, { production: NONE });
    let s = recordProduction(createSession([a, b, other]), "w", "spoken");
    expect(s.byId["a"]!.production).toEqual(DONE);
    expect(s.byId["b"]!.production).toEqual(DONE);
    expect(s.byId["c"]!.production).toEqual(NONE);
    s = answerCard(s, "good", ctx).state; // gate open now → moves past rung 5
    expect(s.byId["a"]!.card).toMatchObject({ ladderStep: 6, dueDate: "2026-12-11" });
  });

  it("previews intervals per grade", () => {
    expect(previewIntervals(sc("1", { ladderStep: 2, status: "review" }), ctx)).toEqual({
      again: 0,
      hard: 4,
      good: 7,
      easy: 12,
    });
  });
});
