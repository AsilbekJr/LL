import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, StoryLevelId, Tables } from "@/lib/supabase/database.types";
import { DbWriteError } from "@/lib/supabase/write-error";
import type { WeekWordCandidate } from "./story";

type Client = SupabaseClient<Database>;

/**
 * Words of one week: answered in review in [from, to) and/or added in it.
 * `from` / `to` are ISO instants (the week's bounds in the learner's timezone).
 */
export async function fetchWeekCandidates(
  sb: Client,
  from: string,
  to: string,
): Promise<WeekWordCandidate[]> {
  type Word = { id: string; english: string; uzbek: string; type: string };
  const [reviews, added] = await Promise.all([
    sb
      .from("review_logs")
      .select("cards(items(id, english, uzbek, type))")
      .gte("reviewed_at", from)
      .lt("reviewed_at", to)
      .limit(5000)
      .returns<{ cards: { items: Word | null } | null }[]>(),
    sb
      .from("items")
      .select("id, english, uzbek, type")
      .gte("created_at", from)
      .lt("created_at", to)
      .limit(1000)
      .returns<Word[]>(),
  ]);
  if (reviews.error) throw new Error(reviews.error.message);
  if (added.error) throw new Error(added.error.message);

  const byId = new Map<string, WeekWordCandidate>();
  for (const r of reviews.data ?? []) {
    const w = r.cards?.items;
    if (!w) continue;
    const c = byId.get(w.id) ?? { ...w, reviews: 0, added: false };
    c.reviews++;
    byId.set(w.id, c);
  }
  for (const w of added.data ?? []) {
    const c = byId.get(w.id) ?? { ...w, reviews: 0, added: false };
    c.added = true;
    byId.set(w.id, c);
  }
  return [...byId.values()];
}

export type StorySummary = Pick<
  Tables<"weekly_stories">,
  "id" | "week_start" | "level" | "title" | "memorized_parts" | "best_retell" | "retold_at"
>;

/** The learner's stories, newest week first. */
export async function fetchStories(sb: Client): Promise<StorySummary[]> {
  const { data, error } = await sb
    .from("weekly_stories")
    .select("id, week_start, level, title, memorized_parts, best_retell, retold_at")
    .order("week_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type StoryRow = Tables<"weekly_stories">;

export async function fetchStory(
  sb: Client,
  weekStart: string,
  level: StoryLevelId,
): Promise<StoryRow | null> {
  const { data, error } = await sb
    .from("weekly_stories")
    .select("*")
    .eq("week_start", weekStart)
    .eq("level", level)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Progress only ever goes up (another device may have saved more). */
export async function saveStoryProgress(
  sb: Client,
  story: Pick<StoryRow, "id" | "memorized_parts" | "best_retell">,
  patch: { memorizedParts?: number; retell?: number },
): Promise<void> {
  const update: Database["public"]["Tables"]["weekly_stories"]["Update"] = {};
  if (patch.memorizedParts !== undefined && patch.memorizedParts > story.memorized_parts) {
    update.memorized_parts = patch.memorizedParts;
  }
  if (patch.retell !== undefined) {
    update.retold_at = new Date().toISOString();
    if (patch.retell > (story.best_retell ?? -1)) update.best_retell = patch.retell;
  }
  if (!Object.keys(update).length) return;
  const { error } = await sb.from("weekly_stories").update(update).eq("id", story.id);
  if (error) throw new DbWriteError(error);
}
