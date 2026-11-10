import { inferItemType, type ItemDraft } from "@/lib/schemas/item";
import type { CefrLevel } from "@/lib/supabase/database.types";
import { makeCloze } from "@/lib/text/answer";
import { loadAll, type VocabEntry } from "@/lib/vocab/dictionary";
import { loadExamples, loadTranslations, type TranslationPrompt } from "@/lib/vocab/sentences";
import { WORD_DETAILS_MAX, wordDetailsResponseSchema, type WordDetail } from "./word-details";

/**
 * Auto-filled card details for a new word: part of speech, level, an example
 * sentence (English + Uzbek) and a short Uzbek note.
 *  1. Offline sources first: the built-in dictionary (part of speech, level)
 *     and the Tatoeba sentence bank (an example, often with its Uzbek
 *     translation).
 *  2. Then, when AI is on, Gemini checks that the example fits the meaning,
 *     translates it and writes the note. Best effort: any failure keeps
 *     what step 1 found.
 * Only EMPTY fields are ever filled: what the learner typed always wins.
 */
export type Details = Partial<
  Pick<ItemDraft, "part_of_speech" | "cefr_level" | "example_en" | "example_uz" | "notes">
>;

type Source = Pick<ItemDraft, "english" | "uzbek"> & Partial<Pick<ItemDraft, "type" | "cefr_level">>;

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Sentences are their own example; only words and phrases get details. */
export function wantsDetails(d: Pick<ItemDraft, "english"> & { type?: ItemDraft["type"] | null }): boolean {
  return (d.type ?? inferItemType(d.english)) !== "sentence";
}

export function findEntry(english: string, entries: readonly VocabEntry[]): VocabEntry | null {
  const k = key(english);
  return entries.find((e) => key(e.english) === k) ?? null;
}

const LEVEL_RANK: Record<CefrLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

/** Shortest Tatoeba EN+UZ pair containing the exact word, at or below the level when known. */
export function pairExample(
  english: string,
  prompts: readonly TranslationPrompt[],
  level?: CefrLevel | null,
): TranslationPrompt | null {
  const fits = prompts.filter(
    (p) => (!level || LEVEL_RANK[p.level] <= LEVEL_RANK[level]) && makeCloze(p.english, english) !== null,
  );
  return fits.sort((a, b) => a.english.length - b.english.length)[0] ?? null;
}

/** Shortest bank sentence containing the exact word (English only). */
export function bankSentence(english: string, sentences: readonly string[] | undefined): string | null {
  const fits = (sentences ?? []).filter((s) => makeCloze(s, english) !== null);
  return fits.sort((a, b) => a.length - b.length)[0] ?? null;
}

/** Step 1: dictionary + sentence bank (works offline once the files are cached). */
export async function localDetails(src: Source, entry?: VocabEntry | null): Promise<Details> {
  if (!wantsDetails(src)) return {};
  const found = entry ?? findEntry(src.english, await loadAll().catch(() => []));
  const level = src.cefr_level ?? found?.level ?? null;
  const out: Details = {};
  if (found) {
    out.part_of_speech = found.pos;
    out.cefr_level = found.level;
  }
  const pair = pairExample(src.english, await loadTranslations().catch(() => []), level);
  if (pair) {
    out.example_en = pair.english;
    out.example_uz = pair.uzbek;
  } else if (found) {
    const bank = await loadExamples(found.level).catch(() => ({}) as Record<string, string[]>);
    const sentence = bankSentence(src.english, bank[found.english] ?? bank[key(found.english)]);
    if (sentence) out.example_en = sentence;
  }
  return out;
}

/** Step 2: Gemini, in batches of 20. Returns details by English key; empty on any failure. */
export async function aiDetails(
  words: { src: Source; local: Details }[],
  signal?: AbortSignal,
): Promise<Map<string, WordDetail>> {
  const out = new Map<string, WordDetail>();
  for (let i = 0; i < words.length; i += WORD_DETAILS_MAX) {
    const chunk = words.slice(i, i + WORD_DETAILS_MAX);
    try {
      const res = await fetch("/api/word-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: signal ?? AbortSignal.timeout(30_000),
        body: JSON.stringify({
          words: chunk.map(({ src, local }) => ({
            english: src.english,
            uzbek: src.uzbek,
            level: src.cefr_level ?? local.cefr_level ?? undefined,
            part_of_speech: local.part_of_speech || undefined,
            example_en: local.example_en || undefined,
          })),
        }),
      });
      if (!res.ok) break; // disabled, rate limited or down: keep the offline details
      const data = wordDetailsResponseSchema.safeParse(await res.json());
      (data.success ? data.data.items : []).forEach((item, j) => {
        // Match by text; fall back to position (the model is told to keep the order).
        const src = chunk.find((w) => key(w.src.english) === key(item.english))?.src ?? chunk[j]?.src;
        if (src) out.set(key(src.english), item);
      });
    } catch {
      break;
    }
  }
  return out;
}

/**
 * A word the built-in dictionary does not have: translation, level and details
 * from Gemini. null when AI is off, down, or does not know the word.
 */
export async function aiLookup(english: string, signal?: AbortSignal): Promise<WordDetail | null> {
  const src = { english, uzbek: "" };
  const found = (await aiDetails([{ src, local: {} }], signal ?? AbortSignal.timeout(20_000))).get(
    key(english),
  );
  return found?.uzbek.trim() ? found : null;
}

const blank = (v: string | null | undefined) => !v || !v.trim();

/**
 * Merge found details into a draft, filling empty fields only. The example
 * is a pair: a new English example always comes with its own translation.
 */
export function mergeDetails<T extends Details>(
  draft: T,
  local: Details,
  ai?: Pick<WordDetail, "part_of_speech" | "example_en" | "example_uz" | "notes"> | null,
): T {
  const next = { ...draft };
  const pos = (ai?.part_of_speech || local.part_of_speech || "").trim();
  if (blank(next.part_of_speech) && pos) next.part_of_speech = pos;
  if (!next.cefr_level && local.cefr_level) next.cefr_level = local.cefr_level;
  if (blank(next.example_en) && blank(next.example_uz)) {
    const en = ai?.example_en?.trim() ? ai.example_en.trim() : (local.example_en ?? "");
    const uz = ai?.example_en?.trim() ? ai.example_uz.trim() : (local.example_uz ?? "");
    if (en) next.example_en = en;
    if (uz) next.example_uz = uz;
  } else if (blank(next.example_uz) && ai && next.example_en?.trim() === ai.example_en.trim()) {
    next.example_uz = ai.example_uz.trim();
  }
  if (blank(next.notes) && ai?.notes?.trim()) next.notes = ai.notes.trim();
  return next;
}

/** Fill details for a whole list (paste-a-list). */
export async function enrichDrafts<T extends ItemDraft>(drafts: T[], opts: { ai: boolean }): Promise<T[]> {
  const words = await Promise.all(
    drafts.map(async (d) => ({ draft: d, local: wantsDetails(d) ? await localDetails(d) : {} })),
  );
  const todo = words.filter((w) => wantsDetails(w.draft)).map((w) => ({ src: w.draft, local: w.local }));
  const ai = opts.ai && todo.length ? await aiDetails(todo) : new Map<string, WordDetail>();
  return words.map(({ draft, local }) =>
    wantsDetails(draft) ? mergeDetails(draft, local, ai.get(key(draft.english))) : draft,
  );
}
