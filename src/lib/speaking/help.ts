import { usesTerm } from "@/lib/text/usage";

/**
 * "Yordam zinapoyasi" — help on a speaking prompt opens one step at a time,
 * from least to most, so the learner tries to produce the word first and
 * takes only as much help as needed:
 *
 *   1 — translation of the prompt
 *   2 — how to start (Uzbek hint / first words)
 *   3 — the chunk with the word + an English sentence starter
 *   4 — a full model answer
 *
 * The deepest step used is stored in the production's `context` as
 * `<base>:h<step>` (no schema change). An answer given after the model was
 * shown is repetition, not production: it is saved, but does not count
 * toward active vocabulary.
 */
export const HELP_MODEL = 4;
const SUFFIX = /:h([1-4])$/;

export function withHelp(base: string, step: number): string {
  const s = Math.max(0, Math.min(HELP_MODEL, Math.floor(step)));
  return s > 0 ? `${base}:h${s}` : base;
}

export function helpOf(context: string | null | undefined): number {
  const m = context ? SUFFIX.exec(context) : null;
  return m ? Number(m[1]) : 0;
}

/** Whether a passed spoken answer counts toward "active" (not said after seeing the model). */
export function countsAsActive(context: string | null | undefined): boolean {
  return helpOf(context) < HELP_MODEL;
}

/**
 * The first words of a reference sentence as a start hint: about a third of
 * it (1–4 words), never reaching the target word, never the whole sentence.
 */
export function sentenceStart(sentence: string, target?: string | null): string | null {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  let n = Math.min(4, Math.max(1, Math.floor(words.length / 3)));
  if (target) while (n > 0 && usesTerm(words.slice(0, n).join(" "), target)) n--;
  return n > 0 ? `${words.slice(0, n).join(" ")} …` : null;
}
