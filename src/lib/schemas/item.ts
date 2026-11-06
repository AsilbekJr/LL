import { z } from "zod";
import type { CefrLevel, ItemType } from "@/lib/supabase/database.types";

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const satisfies readonly CefrLevel[];
export const ITEM_TYPES = ["word", "phrase", "sentence"] as const satisfies readonly ItemType[];

/** Key used for duplicate detection — mirrors the DB index `lower(btrim(english))`. */
export function englishKey(english: string): string {
  return english.trim().toLowerCase();
}

/** Collapse inner whitespace and trim. */
export function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Guess the item type: sentences end with punctuation or are long; anything with a space is a phrase. */
export function inferItemType(english: string): ItemType {
  const t = cleanText(english);
  const words = t.split(" ").filter(Boolean).length;
  if (/[.!?]$/.test(t) || words >= 6) return "sentence";
  if (words >= 2) return "phrase";
  return "word";
}

/** "travel, Work ,  ielts" → ["travel", "work", "ielts"] (unique, lower-case, max 20). */
export function parseTags(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input) ? input : (input ?? "").split(",");
  const out: string[] = [];
  for (const t of raw) {
    const tag = cleanText(String(t)).toLowerCase().slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 20);
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      const t = v == null ? "" : cleanText(v);
      return t === "" ? null : t;
    });

/** One item as entered in the app or found in an import file. */
export const itemInputSchema = z
  .object({
    english: z.string().transform(cleanText).pipe(z.string().min(1, "Inglizcha matn kerak").max(500)),
    uzbek: z.string().transform(cleanText).pipe(z.string().min(1, "O'zbekcha tarjima kerak").max(500)),
    type: z.enum(ITEM_TYPES).nullish(),
    cefr_level: z.enum(CEFR_LEVELS).nullish(),
    part_of_speech: optionalText(40),
    example_en: optionalText(1000),
    example_uz: optionalText(1000),
    notes: optionalText(2000),
    tags: z
      .union([z.string(), z.array(z.string())])
      .nullish()
      .transform((v) => parseTags(v)),
  })
  .transform((v) => ({
    ...v,
    type: v.type ?? inferItemType(v.english),
    cefr_level: v.cefr_level ?? null,
  }));

export type ItemInput = z.input<typeof itemInputSchema>;
export type ItemDraft = z.output<typeof itemInputSchema>;
