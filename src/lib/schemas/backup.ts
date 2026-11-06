import { z } from "zod";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Full backup of the user's data. Rows are stored as they come from the DB
 * (minus user_id, which is re-assigned on restore). Restore is a MERGE:
 * nothing existing is overwritten; items whose English text already exists
 * are skipped together with their cards/logs/productions.
 */
export const BACKUP_FORMAT = "ll-backup";
export const BACKUP_VERSION = 1;

type Row<T extends "packs" | "items" | "cards" | "review_logs" | "productions"> = Omit<Tables<T>, "user_id">;

// Rows are validated loosely (the keys restore relies on); the DB enforces
// every column check on insert.
const row = z.looseObject({ id: z.uuid() });

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exported_at: z.string(),
  data: z.object({
    packs: z.array(row),
    items: z.array(row.extend({ english: z.string() })),
    cards: z.array(row.extend({ item_id: z.uuid() })),
    review_logs: z.array(row.extend({ card_id: z.uuid() })),
    productions: z.array(row.extend({ item_id: z.uuid() })),
    settings: z.looseObject({}).nullable(),
  }),
});

export interface BackupData {
  packs: Row<"packs">[];
  items: Row<"items">[];
  cards: Row<"cards">[];
  review_logs: Row<"review_logs">[];
  productions: Row<"productions">[];
  settings: Omit<Tables<"settings">, "user_id"> | null;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exported_at: string;
  data: BackupData;
}

/** Drop `user_id` from every row. */
export function stripUser<T extends { user_id?: unknown }>(rows: T[]): Omit<T, "user_id">[] {
  return rows.map(({ user_id: _u, ...rest }) => rest);
}

export function backupFileName(now: Date): string {
  return `ll-zaxira-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Decide what a restore inserts. Items are matched by English text against
 * `existingKeys`; dependent rows follow their item.
 */
export function planRestore(
  data: z.infer<typeof backupSchema>["data"],
  existingKeys: ReadonlySet<string>,
  englishKey: (s: string) => string,
) {
  const items = data.items.filter((i) => !existingKeys.has(englishKey(i.english)));
  const itemIds = new Set(items.map((i) => i.id));
  const cards = data.cards.filter((c) => itemIds.has(c.item_id));
  const cardIds = new Set(cards.map((c) => c.id));
  return {
    packs: data.packs,
    items,
    cards,
    review_logs: data.review_logs.filter((l) => cardIds.has(l.card_id)),
    productions: data.productions.filter((p) => itemIds.has(p.item_id)),
    skippedItems: data.items.length - items.length,
  };
}
