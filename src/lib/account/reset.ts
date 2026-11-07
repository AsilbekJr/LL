import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getOfflineDb } from "@/lib/offline/db";

type Client = SupabaseClient<Database>;
export type ResetMode = "all" | "progress";

/** The word the learner must type to confirm. */
export const RESET_CONFIRM_WORD = "TOZALASH";

export function isResetConfirmed(typed: string): boolean {
  return typed.trim().toLocaleUpperCase("en-US") === RESET_CONFIRM_WORD;
}

export interface ResetSummary {
  mode: ResetMode;
  items: number;
  cards: number;
  reviews: number;
  productions: number;
  texts: number;
  settings: boolean;
}

export interface ResetPreview {
  items: number;
  studied: number;
  reviews: number;
  productions: number;
  texts: number;
}

/** What a reset would touch (shown in the confirmation dialog). */
export async function fetchResetPreview(sb: Client): Promise<ResetPreview> {
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  };
  const head = { count: "exact" as const, head: true };
  const [items, studied, reviews, productions, texts] = await Promise.all([
    count(sb.from("items").select("id", head)),
    count(sb.from("cards").select("id", head).neq("status", "new")),
    count(sb.from("review_logs").select("id", head)),
    count(sb.from("productions").select("id", head)),
    count(sb.from("reading_texts").select("id", head)),
  ]);
  return { items, studied, reviews, productions, texts };
}

/**
 * Data on this device that would bring old progress back: queued offline
 * answers, the cached session and local progress. Cleared before AND after
 * the server reset, so nothing re-syncs into the fresh account.
 */
export async function clearLocalLearningData(): Promise<void> {
  const db = getOfflineDb();
  if (db) await Promise.all([db.outbox.clear(), db.session.clear(), db.local.clear(), db.failed.clear()]);
  try {
    window.localStorage.removeItem("ll.speaking.level");
  } catch {
    // ignore
  }
}

export async function resetMyData(
  sb: Client,
  mode: ResetMode,
  resetSettings: boolean,
): Promise<ResetSummary> {
  // Queued offline answers would re-create old progress after the reset, so
  // they are set aside first — and put back if the reset fails (nothing lost).
  const db = getOfflineDb();
  const queued = db ? await db.outbox.toArray() : [];
  if (db) await db.outbox.clear();
  const { data, error } = await sb.rpc("reset_my_data", { p_mode: mode, p_reset_settings: resetSettings });
  if (error) {
    if (db && queued.length) await db.outbox.bulkAdd(queued.map(({ id: _id, ...row }) => row));
    throw new Error(error.message);
  }
  await clearLocalLearningData();
  return data as unknown as ResetSummary;
}
