import type { CefrLevel } from "@/lib/supabase/database.types";
import type { IsoDate } from "@/lib/srs/dates";
import type { CohortChip } from "@/lib/srs/cohorts";
import { gateStartIndex } from "@/lib/srs/ladder";
import { isProductionDone, nextProductionMode } from "@/lib/srs/mastery";
import { pickContext } from "@/lib/production/contexts";
import { methodForStage } from "@/lib/srs/stages";
import type { ItemType, ProductionProgress, ReviewMethod, SrsCard } from "@/lib/srs/types";
import { clozeLongestWord, makeCloze, sentenceTokens } from "@/lib/text/answer";
import { contextSentences, pickContextSentence, TRANSLATE_FROM_STAGE } from "@/lib/items/context-sentences";

export interface SessionItem {
  id: string;
  type: ItemType;
  english: string;
  uzbek: string;
  example_en: string | null;
  example_uz: string | null;
  part_of_speech: string | null;
  notes: string | null;
  cefr_level?: CefrLevel | null;
  /** Gap orqali yodlash: sentences in different situations (jsonb; parse with contextSentences). */
  context_sentences?: unknown;
}

export interface SessionCard {
  card: SrsCard;
  item: SessionItem;
  production: ProductionProgress;
  /** The other direction card of the item has passed the whole ladder. */
  siblingComplete: boolean;
  siblingId: string | null;
  /**
   * 'random' mode: the sibling was due today too and was left out (one
   * direction per word a day). Answering this card moves it to tomorrow.
   */
  deferSibling?: boolean;
  /** A known word met in its second direction (UZ→EN) for the first time. */
  secondDirection?: boolean;
  /** Takrorlash xaritasi: the word's first-study day, review number and place (optional extra). */
  cohort?: CohortChip;
}

/** A change to the other direction's card that comes with an answer. */
export interface SiblingPatch {
  id: string;
  dueDate: IsoDate;
  /** Set when the whole word became mastered. */
  status?: "mastered";
  /** Only apply while the sibling is still due by this day (never undo a newer review). */
  onlyIfDueBy?: IsoDate;
}

/** What the screen shows for one card. Every kind maps to one ReviewMethod for the log. */
export type Exercise =
  | { kind: "encounter"; method: "encounter" }
  | {
      kind: "choice";
      method: "recognition";
      prompt: string;
      promptLang: "en" | "uz";
      options: string[];
      correct: number;
    }
  | { kind: "recall"; method: "recall"; prompt: string; promptLang: "en" | "uz"; answer: string }
  | { kind: "spelling"; method: "spelling"; prompt: string; answer: string }
  | { kind: "listening"; method: "listening"; say: string; answer: string; hint: string }
  | { kind: "cloze"; method: "cloze"; before: string; after: string; answer: string; hint: string }
  | { kind: "order"; method: "word_order"; tokens: string[]; answer: string[]; hint: string }
  /** Gap orqali yodlash: say the word's context sentence in English from its Uzbek version. */
  | {
      kind: "sentence";
      method: "sentence";
      situation: string;
      prompt: string;
      reference: string;
      term: string;
    }
  /** Production gate: the learner writes / says their own sentence with the word. */
  | { kind: "write"; method: "writing"; contextId: string }
  | { kind: "speak"; method: "speaking"; contextId: string };

export interface ExerciseEnv {
  /** Other items to draw multiple-choice distractors from. */
  pool: SessionItem[];
  /** Speech synthesis is available on this device. */
  canSpeak: boolean;
  random: () => number;
  gateSteps: number;
  ladderLength: number;
}

export function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * The production gate is holding this card: the item still needs a written
 * and/or a spoken production, so the card gets that exercise instead of its
 * normal method.
 */
export function isProductionPending(
  sc: SessionCard,
  env: Pick<ExerciseEnv, "gateSteps" | "ladderLength">,
): boolean {
  const gate = gateStartIndex(env.ladderLength, env.gateSteps);
  return gate < env.ladderLength && sc.card.ladderStep >= gate && !isProductionDone(sc.production);
}

function recall(sc: SessionCard): Exercise {
  const en = sc.card.direction === "en_uz";
  return {
    kind: "recall",
    method: "recall",
    prompt: en ? sc.item.english : sc.item.uzbek,
    promptLang: en ? "en" : "uz",
    answer: en ? sc.item.uzbek : sc.item.english,
  };
}

function spelling(sc: SessionCard): Exercise {
  return { kind: "spelling", method: "spelling", prompt: sc.item.uzbek, answer: sc.item.english };
}

function choice(sc: SessionCard, env: ExerciseEnv): Exercise {
  const en = sc.card.direction === "en_uz";
  const field = en ? "uzbek" : "english";
  const correct = sc.item[field];
  const seen = new Set([correct.toLowerCase()]);
  // Prefer distractors of the same type (word vs phrase vs sentence) so length does not give it away.
  const candidates = [
    ...shuffle(
      env.pool.filter((p) => p.id !== sc.item.id && p.type === sc.item.type),
      env.random,
    ),
    ...shuffle(
      env.pool.filter((p) => p.id !== sc.item.id && p.type !== sc.item.type),
      env.random,
    ),
  ];
  const distractors: string[] = [];
  for (const c of candidates) {
    const v = c[field];
    if (seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    distractors.push(v);
    if (distractors.length === 3) break;
  }
  if (distractors.length === 0) return recall(sc);
  const options = shuffle([correct, ...distractors], env.random);
  return {
    kind: "choice",
    method: "recognition",
    prompt: en ? sc.item.english : sc.item.uzbek,
    promptLang: en ? "en" : "uz",
    options,
    correct: options.indexOf(correct),
  };
}

function cloze(sc: SessionCard): Exercise | null {
  const { item } = sc;
  const c =
    item.type === "sentence"
      ? clozeLongestWord(item.english)
      : item.example_en
        ? makeCloze(item.example_en, item.english)
        : null;
  if (!c) return null;
  return {
    kind: "cloze",
    method: "cloze",
    before: c.before,
    after: c.after,
    answer: c.answer,
    hint: item.type === "sentence" ? item.uzbek : (item.example_uz ?? item.uzbek),
  };
}

function order(sc: SessionCard, random: () => number): Exercise | null {
  const sentence = sc.item.type === "sentence" ? sc.item.english : sc.item.example_en;
  if (!sentence) return null;
  const answer = sentenceTokens(sentence);
  if (answer.length < 3) return null;
  let tokens = shuffle(answer, random);
  // Never show it already solved.
  for (let i = 0; i < 5 && tokens.join(" ") === answer.join(" "); i++) tokens = shuffle(answer, random);
  if (tokens.join(" ") === answer.join(" ")) tokens = [...answer.slice(1), answer[0]!];
  const hint = sc.item.type === "sentence" ? sc.item.uzbek : (sc.item.example_uz ?? sc.item.uzbek);
  return { kind: "order", method: "word_order", tokens, answer, hint };
}

/**
 * Gap orqali yodlash: every other review of a word that has context sentences
 * asks for one of them (a different one each time) instead of the stage
 * method — a cloze while the word is new, the whole sentence (UZ → EN) once
 * the card reaches TRANSLATE_FROM_STAGE. Encounters stay as they are.
 */
export function contextExercise(sc: SessionCard): Exercise | null {
  if (sc.item.type === "sentence" || sc.card.stage < 2 || sc.card.reps % 2 === 0) return null;
  const pick = pickContextSentence(
    contextSentences(sc.item.context_sentences),
    Math.floor(sc.card.reps / 2),
    sc.card.direction,
  );
  if (!pick) return null;
  const hint = `${pick.situation} · ${pick.uz}`;
  if (sc.card.stage < TRANSLATE_FROM_STAGE) {
    const c = makeCloze(pick.en, pick.form || sc.item.english) ?? makeCloze(pick.en, sc.item.english);
    return c
      ? { kind: "cloze", method: "cloze", before: c.before, after: c.after, answer: c.answer, hint }
      : null;
  }
  return {
    kind: "sentence",
    method: "sentence",
    situation: pick.situation,
    prompt: pick.uz,
    reference: pick.en,
    term: sc.item.english,
  };
}

/** Build the exercise for a card from its stage, with graceful fallbacks. */
export function planExercise(sc: SessionCard, env: ExerciseEnv): Exercise {
  if (isProductionPending(sc, env)) {
    const contextId = pickContext(env.random).id;
    return nextProductionMode(sc.production) === "spoken"
      ? { kind: "speak", method: "speaking", contextId }
      : { kind: "write", method: "writing", contextId };
  }

  const context = contextExercise(sc);
  if (context) return context;

  const method: ReviewMethod = methodForStage(sc.card.stage, sc.item.type);
  switch (method) {
    case "encounter":
      return { kind: "encounter", method: "encounter" };
    case "recognition":
      return choice(sc, env);
    case "recall":
      return recall(sc);
    case "spelling":
      return spelling(sc);
    case "listening":
      return env.canSpeak
        ? {
            kind: "listening",
            method: "listening",
            say: sc.item.english,
            answer: sc.item.english,
            hint: sc.item.uzbek,
          }
        : spelling(sc);
    case "cloze":
      return cloze(sc) ?? spelling(sc);
    case "word_order":
      return order(sc, env.random) ?? cloze(sc) ?? recall(sc);
    default:
      return recall(sc);
  }
}
