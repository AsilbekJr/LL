import { itemInputSchema, type ItemDraft } from "@/lib/schemas/item";

/**
 * "Paste a list" parser. One item per line, English first:
 *   apple - olma
 *   to give up — taslim bo'lmoq
 *   break the ice<TAB>muzni eritmoq
 * Separators, in priority order: TAB, " — ", " – ", " - ", " = ", " : ".
 * Blank lines and lines starting with # are skipped.
 */
const SEPARATORS = ["\t", " — ", " – ", " - ", " = ", " : "];

export interface PasteError {
  line: number;
  text: string;
  reason: string;
}

export interface PasteResult {
  items: (ItemDraft & { line: number })[];
  errors: PasteError[];
}

export function splitLine(line: string): [string, string] | null {
  for (const sep of SEPARATORS) {
    const i = line.indexOf(sep);
    if (i > 0) return [line.slice(0, i), line.slice(i + sep.length)];
  }
  return null;
}

export function parsePasteList(
  text: string,
  defaults: { cefr_level?: ItemDraft["cefr_level"]; tags?: string[] } = {},
): PasteResult {
  const items: PasteResult["items"] = [];
  const errors: PasteError[] = [];

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = splitLine(line);
    if (!parts) {
      errors.push({ line: idx + 1, text: line, reason: "Ajratuvchi topilmadi (masalan: apple - olma)" });
      return;
    }
    const parsed = itemInputSchema.safeParse({
      english: parts[0],
      uzbek: parts[1],
      cefr_level: defaults.cefr_level ?? null,
      tags: defaults.tags ?? [],
    });
    if (!parsed.success) {
      errors.push({
        line: idx + 1,
        text: line,
        reason: parsed.error.issues[0]?.message ?? "Noto'g'ri qator",
      });
      return;
    }
    items.push({ ...parsed.data, line: idx + 1 });
  });

  return { items, errors };
}
