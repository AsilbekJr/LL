import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk } from "@/lib/items/dedupe";
import { startedItemsOf, trimCutItem, wordsStartedToday } from "@/lib/srs/today";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** How many new cards are scanned to tell new words from second directions. */
const NEW_SCAN = 5000;

export interface NewCardRow {
  id: string;
  item_id: string;
  direction: "en_uz" | "uz_en";
}

export interface TodayState {
  /** All new cards, oldest first (pairs kept together). */
  newCards: NewCardRow[];
  startedItems: Set<string>;
  /** Started words whose first direction is in review (or mastered): the second one may open. */
  readyItems: Set<string>;
  touchedToday: Set<string>;
  newItemsDoneToday: number;
  reviewsDoneToday: number;
  /** Cards practised today (any kind of answer). */
  practisedToday: Set<string>;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/** Today's progress and the new-card list, as both the page and the session need them. */
export async function loadTodayState(sb: Client, dayStart: string): Promise<TodayState> {
  const [fresh, logs] = await Promise.all([
    sb
      .from("cards")
      .select("id, item_id, direction")
      .eq("status", "new")
      .order("created_at")
      .order("item_id")
      .limit(NEW_SCAN),
    sb
      .from("review_logs")
      .select("card_id, method, result, cards(item_id)")
      .gte("reviewed_at", dayStart)
      .returns<
        { card_id: string; method: string; result: string | null; cards: { item_id: string } | null }[]
      >(),
  ]);
  const newCards = trimCutItem(check(fresh), NEW_SCAN);
  const todayLogs = check(logs);

  const encountered = new Set<string>();
  const touchedToday = new Set<string>();
  const reviewed = new Set<string>();
  const practised = new Set<string>();
  for (const l of todayLogs) {
    practised.add(l.card_id);
    if (l.result !== null) reviewed.add(l.card_id);
    if (l.method === "encounter") {
      encountered.add(l.card_id);
      if (l.cards) touchedToday.add(l.cards.item_id);
    }
  }

  let newItemsDoneToday = 0;
  if (touchedToday.size) {
    const rows: { id: string; item_id: string; status: string }[] = [];
    for (const ids of chunk([...touchedToday], 150)) {
      rows.push(...check(await sb.from("cards").select("id, item_id, status").in("item_id", ids)));
    }
    newItemsDoneToday = wordsStartedToday(encountered, rows);
  }

  // Which started words know their first direction well enough for the second.
  const startedItems = startedItemsOf(newCards);
  const readyItems = new Set<string>();
  for (const ids of chunk([...startedItems], 150)) {
    const rows = check(
      await sb.from("cards").select("item_id").in("item_id", ids).in("status", ["review", "mastered"]),
    );
    for (const r of rows) readyItems.add(r.item_id);
  }

  return {
    newCards,
    startedItems,
    readyItems,
    touchedToday,
    newItemsDoneToday,
    reviewsDoneToday: reviewed.size,
    practisedToday: practised,
  };
}
