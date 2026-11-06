import { shuffle } from "@/lib/session/exercise";
import { usesTerm } from "@/lib/text/usage";

export const DRILL_MIN_ITEMS = 3;
export const DRILL_MAX_ITEMS = 5;
export const DRILL_MAX_SECONDS = 90;

/** Pick 3–5 targets for a free speaking drill (words and phrases only — not full sentences). */
export function pickDrillTargets<T extends { id: string; type: string }>(
  items: T[],
  random: () => number,
): T[] {
  const usable = items.filter((i) => i.type !== "sentence");
  const pool = usable.length >= DRILL_MIN_ITEMS ? usable : items;
  const n = Math.min(
    pool.length,
    DRILL_MIN_ITEMS + Math.floor(random() * (DRILL_MAX_ITEMS - DRILL_MIN_ITEMS + 1)),
  );
  return shuffle(pool, random).slice(0, n);
}

/** Which targets the transcript used. */
export function scoreDrill<T extends { id: string; english: string }>(transcript: string, targets: T[]) {
  const used = targets.filter((t) => usesTerm(transcript, t.english));
  return { used: new Set(used.map((t) => t.id)), count: used.length, total: targets.length };
}

/** A sentence to shadow for an item: the item itself if it is a sentence, otherwise its example. */
export function shadowSentence(item: {
  type: string;
  english: string;
  example_en: string | null;
}): string | null {
  if (item.type === "sentence") return item.english;
  return item.example_en && item.example_en.split(/\s+/).length >= 3 ? item.example_en : null;
}
