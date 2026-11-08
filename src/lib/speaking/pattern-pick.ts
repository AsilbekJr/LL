import type { CefrLevel } from "@/lib/supabase/database.types";
import { fitsSlot, PATTERNS, pickPattern, type SpeakingPattern } from "@/lib/production/patterns";
import { MAX_FIT_PATTERNS, type FitRequest, type PatternFit } from "./fit";

type Item = {
  id: string;
  type: string;
  english: string;
  uzbek: string;
  part_of_speech?: string | null;
};

export interface PatternPick<T extends Item> {
  pattern: SpeakingPattern;
  item: T;
  /** A sensible model sentence for this word in this frame (AI only). */
  model: PatternFit | null;
}

/** How many words are tried before giving up on a sensible pair. */
export const MAX_WORD_TRIES = 6;

function shuffle<T>(arr: T[], random: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * A frame + word pair that makes a sensible sentence. With AI, the word's
 * candidate frames (same level, right part of speech) are checked for meaning
 * and only a frame the word really fits is used; words are tried in random
 * order. Without AI (`fits` returns null) it falls back to part-of-speech
 * matching. null = nothing sensible at this level.
 */
export async function pickSensiblePattern<T extends Item>(opts: {
  level: CefrLevel;
  items: T[];
  random: () => number;
  fits: (req: FitRequest) => Promise<PatternFit[] | null>;
  /** Don't repeat this frame. */
  avoid?: string;
  /** Keep this frame, change only the word. */
  pattern?: string;
  /** Don't use this word. */
  excludeItem?: string;
}): Promise<PatternPick<T> | null> {
  const { level, random } = opts;
  const patterns = PATTERNS.filter(
    (p) => p.level === level && (opts.pattern ? p.id === opts.pattern : p.id !== opts.avoid),
  );
  const items = opts.items.filter((i) => i.id !== opts.excludeItem);
  const candidates = shuffle(
    items
      .map((item) => ({ item, frames: patterns.filter((p) => fitsSlot(p.slot, item)) }))
      .filter((c) => c.frames.length > 0),
    random,
  );

  for (const c of candidates.slice(0, MAX_WORD_TRIES)) {
    const frames = shuffle(c.frames, random).slice(0, MAX_FIT_PATTERNS);
    const fits = await opts.fits({
      level,
      word: {
        english: c.item.english,
        uzbek: c.item.uzbek,
        ...(c.item.part_of_speech?.trim() ? { pos: c.item.part_of_speech.trim() } : {}),
      },
      patterns: frames.map((p) => ({ id: p.id, en: p.en })),
    });
    if (fits === null) {
      // AI unavailable: part-of-speech matching only.
      const p = pickPattern(level, items, random, opts.avoid);
      if (!opts.pattern) return p && { ...p, model: null };
      const pattern = patterns[0];
      const fit = pattern ? items.filter((i) => fitsSlot(pattern.slot, i)) : [];
      return pattern && fit.length
        ? { pattern, item: fit[Math.floor(random() * fit.length)]!, model: null }
        : null;
    }
    const usable = fits.filter((f) => frames.some((p) => p.id === f.id));
    if (usable.length) {
      const model = usable[Math.floor(random() * usable.length)]!;
      return { pattern: frames.find((p) => p.id === model.id)!, item: c.item, model };
    }
  }
  return null;
}
