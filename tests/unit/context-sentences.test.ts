import { describe, expect, it } from "vitest";
import {
  cleanGenerated,
  contextReplySchema,
  contextSentences,
  gradeSentence,
  pickContextSentence,
  TRANSLATE_FROM_STAGE,
} from "@/lib/items/context-sentences";
import { contextExercise, planExercise, type SessionCard } from "@/lib/session/exercise";

const sentences = [
  {
    situation: "Uyda",
    en: "I washed the cups in the sink.",
    uz: "Piyolalarni rakovinada yuvdim.",
    form: "sink",
  },
  {
    situation: "Ishda",
    en: "The sink in our office is broken.",
    uz: "Ofisimizdagi rakovina buzilgan.",
    form: "sink",
  },
  {
    situation: "Do'konda",
    en: "We bought a new sink for the kitchen.",
    uz: "Oshxonaga yangi rakovina oldik.",
    form: "sink",
  },
  {
    situation: "Mehmonda",
    en: "Don't leave dirty plates in the sink.",
    uz: "Iflos likopchalarni rakovinada qoldirma.",
    form: "sink",
  },
  {
    situation: "Ta'mirda",
    en: "Can you fix the sink tomorrow?",
    uz: "Ertaga rakovinani tuzata olasanmi?",
    form: "sink",
  },
];

function card(stage: number, reps: number, direction: "en_uz" | "uz_en" = "en_uz"): SessionCard {
  return {
    card: {
      id: "c",
      itemId: "i",
      direction,
      stage,
      ladderStep: 0,
      dueDate: "2026-11-25",
      lapses: 0,
      reps,
      status: "review",
    },
    item: {
      id: "i",
      type: "word",
      english: "sink",
      uzbek: "rakovina",
      example_en: null,
      example_uz: null,
      part_of_speech: "noun",
      notes: null,
      context_sentences: sentences,
    },
    production: { writtenPassed: false, spokenPassed: false },
    siblingComplete: false,
    siblingId: null,
  } as SessionCard;
}

const env = { pool: [], canSpeak: false, random: () => 0.3, gateSteps: 3, ladderLength: 8 };

describe("context sentences", () => {
  it("parses stored sentences and drops malformed ones", () => {
    expect(contextSentences([...sentences, { en: "x" }, 5])).toHaveLength(5);
    expect(contextSentences(null)).toEqual([]);
  });

  it("rotates the sentence with each review, other direction offset", () => {
    expect(pickContextSentence(sentences, 0, "en_uz")!.situation).toBe("Uyda");
    expect(pickContextSentence(sentences, 1, "en_uz")!.situation).toBe("Ishda");
    expect(pickContextSentence(sentences, 0, "uz_en")!.situation).toBe("Do'konda");
    expect(pickContextSentence(sentences, 7, "en_uz")!.situation).toBe("Do'konda");
    expect(pickContextSentence([], 1, "en_uz")).toBeNull();
  });

  it("grades a typed translation", () => {
    const ref = sentences[0]!.en;
    expect(gradeSentence("I washed the cups in the sink", ref, "sink").result).toBe("good");
    expect(gradeSentence("I washed cups in a sink yesterday", ref, "sink").result).toBe("hard");
    expect(gradeSentence("I washed the cups in the kitchen", ref, "sink")).toMatchObject({
      used: false,
      result: "again",
    });
  });

  it("keeps only generated sentences with the word", () => {
    const out = cleanGenerated(
      [
        ...sentences,
        { situation: "Yo'lda", en: "I washed the cups.", uz: "Piyolalarni yuvdim.", form: "sink" },
        { situation: "Uyda", en: "I washed the cups in the sink.", uz: "dup", form: "sink" },
      ],
      "sink",
    );
    expect(out).toHaveLength(5);
    expect(out.every((s) => s.en.includes("sink"))).toBe(true);
    expect(contextReplySchema.safeParse({ sentences: sentences.slice(0, 2) }).success).toBe(false);
  });
});

describe("context exercise in reviews", () => {
  it("alternates with the normal method", () => {
    expect(contextExercise(card(2, 2))).toBeNull();
    expect(contextExercise(card(2, 3))?.kind).toBe("cloze");
  });

  it("asks a cloze while new and the whole sentence once strong", () => {
    const cloze = contextExercise(card(TRANSLATE_FROM_STAGE - 1, 1));
    expect(cloze).toMatchObject({ kind: "cloze", answer: "sink" });
    const full = contextExercise(card(TRANSLATE_FROM_STAGE, 1));
    expect(full).toMatchObject({ kind: "sentence", method: "sentence", term: "sink" });
  });

  it("uses a different sentence on the next context review", () => {
    const a = contextExercise(card(5, 1));
    const b = contextExercise(card(5, 3));
    expect(a && b && a.kind === "sentence" && b.kind === "sentence" && a.reference !== b.reference).toBe(
      true,
    );
  });

  it("leaves encounters, sentence items and words without sentences alone", () => {
    expect(planExercise(card(1, 1), env).kind).toBe("encounter");
    const plain = card(3, 1);
    plain.item.context_sentences = [];
    expect(contextExercise(plain)).toBeNull();
    const sentenceItem = card(3, 1);
    sentenceItem.item.type = "sentence";
    expect(contextExercise(sentenceItem)).toBeNull();
  });
});
