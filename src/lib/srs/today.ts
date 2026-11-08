/**
 * Pure helpers for "what is left today", shared by the Bugun page and the
 * review session so both count exactly the same way.
 *
 * Every word (item) has two cards: EN→UZ and UZ→EN. A word is NEW while both
 * cards are new; once one direction is being learned, the other new card is
 * the word's second direction (not a new word any more).
 */

/** Items whose cards are not all new: listed with fewer than two new cards. */
export function startedItemsOf(newCards: { item_id: string }[]): Set<string> {
  const count = new Map<string, number>();
  for (const c of newCards) count.set(c.item_id, (count.get(c.item_id) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n < 2).map(([id]) => id));
}

/**
 * Words started today: of the items touched today, those whose every
 * non-new card had its first encounter today (so not a second direction of a
 * word begun on an earlier day).
 */
export function wordsStartedToday(
  encounteredToday: ReadonlySet<string>,
  cardsOfTouchedItems: { id: string; item_id: string; status: string }[],
): number {
  const older = new Set<string>();
  const items = new Set<string>();
  for (const c of cardsOfTouchedItems) {
    items.add(c.item_id);
    if (c.status !== "new" && !encounteredToday.has(c.id)) older.add(c.item_id);
  }
  return [...items].filter((id) => !older.has(id)).length;
}

/** Drop the last item's rows when the scan hit its limit (its pair may be cut off). */
export function trimCutItem<T extends { item_id: string }>(rows: T[], limit: number): T[] {
  if (rows.length < limit || rows.length === 0) return rows;
  const last = rows[rows.length - 1]!.item_id;
  return rows.filter((r) => r.item_id !== last);
}
