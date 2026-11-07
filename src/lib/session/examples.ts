import { makeCloze } from "@/lib/text/answer";
import type { CefrLevel } from "@/lib/supabase/database.types";
import { VOCAB_LEVELS } from "@/lib/vocab/dictionary";
import { loadExamples } from "@/lib/vocab/sentences";
import type { SessionItem } from "./exercise";

/**
 * Pick a bank sentence that contains the exact word (so it can be blanked
 * out for cloze); shortest first — easier to hear and to read.
 */
export function bankExample(
  item: Pick<SessionItem, "english">,
  sentences: string[] | undefined,
): string | null {
  const fits = (sentences ?? []).filter((s) => makeCloze(s, item.english) !== null);
  return fits.sort((a, b) => a.length - b.length)[0] ?? null;
}

/**
 * Give words and phrases without an example sentence one from the Tatoeba
 * bank (mutates the items). Best effort: offline or on a fetch error the
 * session simply goes on without them.
 */
export async function fillExamples(items: SessionItem[]): Promise<void> {
  const missing = items.filter(
    (i) => i.type !== "sentence" && !i.example_en?.trim() && !i.example_uz?.trim(),
  );
  if (!missing.length) return;
  const levels: CefrLevel[] = missing.some((i) => !i.cefr_level)
    ? VOCAB_LEVELS
    : [...new Set(missing.map((i) => i.cefr_level!))];
  try {
    const banks = await Promise.all(levels.map((l) => loadExamples(l).catch(() => ({}))));
    const all: Record<string, string[]> = Object.assign({}, ...banks);
    for (const item of missing) {
      const ex = bankExample(item, all[item.english] ?? all[item.english.toLowerCase()]);
      if (ex) item.example_en = ex;
    }
  } catch {
    // ignore: examples are an extra
  }
}
