import { z } from "zod";
import { CEFR_LEVELS, itemInputSchema, type ItemDraft } from "./item";

/**
 * Pack file (public/samples/template.json):
 *   { "format": "ll-pack", "version": 1, "name": "...", "cefr_level": "A1",
 *     "description": "...", "items": [{ "english": "...", "uzbek": "...", ... }] }
 * A bare array of items is accepted too.
 */
export const MAX_PACK_ITEMS = 5000;

const packMetaSchema = z.object({
  format: z.literal("ll-pack").optional(),
  version: z.literal(1).optional(),
  name: z.string().trim().min(1).max(200),
  cefr_level: z.enum(CEFR_LEVELS).nullish(),
  description: z.string().trim().max(2000).nullish(),
  items: z.array(z.unknown()).max(MAX_PACK_ITEMS, `Ko'pi bilan ${MAX_PACK_ITEMS} ta so'z`),
});

export interface PackItemError {
  index: number;
  reason: string;
}

export interface ParsedPack {
  name: string;
  cefr_level: ItemDraft["cefr_level"];
  description: string | null;
  items: ItemDraft[];
  errors: PackItemError[];
}

export type PackParseResult = { ok: true; pack: ParsedPack } | { ok: false; error: string };

/** Parse a pack file. Invalid items are reported, valid ones are kept. */
export function parsePack(text: string, fallbackName = "Import"): PackParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "Fayl JSON formatida emas" };
  }

  const meta = packMetaSchema.safeParse(Array.isArray(json) ? { name: fallbackName, items: json } : json);
  if (!meta.success) {
    const issue = meta.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    return { ok: false, error: `To'plam formati noto'g'ri${where}: ${issue?.message ?? ""}`.trim() };
  }

  const items: ItemDraft[] = [];
  const errors: PackItemError[] = [];
  meta.data.items.forEach((raw, index) => {
    const withLevel =
      raw && typeof raw === "object" && !("cefr_level" in raw)
        ? { ...raw, cefr_level: meta.data.cefr_level }
        : raw;
    const r = itemInputSchema.safeParse(withLevel);
    if (r.success) items.push(r.data);
    else errors.push({ index, reason: r.error.issues[0]?.message ?? "Noto'g'ri element" });
  });

  return {
    ok: true,
    pack: {
      name: meta.data.name,
      cefr_level: meta.data.cefr_level ?? null,
      description: meta.data.description ?? null,
      items,
      errors,
    },
  };
}

/** Entry in public/samples/index.json. */
export const sampleIndexSchema = z.array(
  z.object({
    file: z.string().regex(/^[a-z0-9-]+\.json$/),
    name: z.string(),
    cefr_level: z.enum(CEFR_LEVELS),
    description: z.string(),
    count: z.number().int().nonnegative(),
  }),
);
export type SampleEntry = z.infer<typeof sampleIndexSchema>[number];
