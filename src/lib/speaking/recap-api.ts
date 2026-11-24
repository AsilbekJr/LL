import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { RECAP_CONTEXT, type RecapWord } from "./recap";

type Client = SupabaseClient<Database>;

const PAGE = 1000;
const STUDIED = ["learning", "review", "mastered"] as const;

export type RecapLibraryWord = RecapWord & { cefr_level: string | null };

/** Every word being learned or known: what a free talk is matched against. */
export async function fetchRecapLibrary(sb: Client): Promise<RecapLibraryWord[]> {
  const out: RecapLibraryWord[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("items")
      .select("id, english, uzbek, type, cefr_level, cards!inner(status)")
      .in("cards.status", [...STUDIED])
      .order("id")
      .range(from, from + PAGE - 1)
      .returns<(RecapLibraryWord & { cards: unknown })[]>();
    if (error) throw new Error(error.message);
    for (const { cards: _c, ...w } of data ?? []) {
      if (!seen.has(w.id)) {
        seen.add(w.id);
        out.push(w);
      }
    }
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

/** Ids of words answered today (since `dayStart`). */
export async function fetchReviewedTodayIds(sb: Client, dayStart: string): Promise<Set<string>> {
  const { data, error } = await sb
    .from("review_logs")
    .select("cards(item_id)")
    .gte("reviewed_at", dayStart)
    .limit(2000)
    .returns<{ cards: { item_id: string } | null }[]>();
  if (error) throw new Error(error.message);
  return new Set((data ?? []).flatMap((r) => (r.cards ? [r.cards.item_id] : [])));
}

export type RecapRow = { created_at: string; passed: boolean; item_id: string };

/** Recap productions since `since` (ISO), for the speaking streak and today's count. */
export async function fetchRecapRows(sb: Client, since: string): Promise<RecapRow[]> {
  const { data, error } = await sb
    .from("productions")
    .select("created_at, passed, item_id")
    .eq("context", RECAP_CONTEXT)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}
