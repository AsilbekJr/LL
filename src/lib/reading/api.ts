import type { SupabaseClient } from "@supabase/supabase-js";
import type { CefrLevel, Database, Json, Tables } from "@/lib/supabase/database.types";
import type { IsoDate } from "@/lib/srs/dates";
import { scheduleText, type BuiltinText, type TextSentence } from "./texts";

type Client = SupabaseClient<Database>;
export type ReadingText = Tables<"reading_texts">;

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function fetchMyTexts(sb: Client): Promise<ReadingText[]> {
  return check(
    await sb.from("reading_texts").select("*").order("updated_at", { ascending: false }).limit(500),
  );
}

export async function fetchText(sb: Client, id: string): Promise<ReadingText | null> {
  return check(await sb.from("reading_texts").select("*").eq("id", id).maybeSingle());
}

/** Start a built-in text (idempotent: returns the existing copy if already started). */
export async function startBuiltin(sb: Client, t: BuiltinText, today: IsoDate): Promise<string> {
  const existing = check(
    await sb.from("reading_texts").select("id").eq("builtin_id", t.id).maybeSingle<{ id: string }>(),
  );
  if (existing) return existing.id;
  const row = check(
    await sb
      .from("reading_texts")
      .insert({
        source: "builtin",
        builtin_id: t.id,
        level: t.level,
        title: t.title,
        title_uz: t.title_uz,
        sentences: t.sentences as unknown as Json,
        key_words: t.words,
        due_date: today,
      })
      .select("id")
      .single<{ id: string }>(),
  )!;
  return row.id;
}

export async function saveAiText(
  sb: Client,
  t: { level: CefrLevel; title: string; title_uz: string; sentences: TextSentence[]; key_words: string[] },
  today: IsoDate,
): Promise<string> {
  const row = check(
    await sb
      .from("reading_texts")
      .insert({ source: "ai", ...t, sentences: t.sentences as unknown as Json, due_date: today })
      .select("id")
      .single<{ id: string }>(),
  )!;
  return row.id;
}

/** Record a finished practice and schedule the next repetition. */
export async function completePractice(
  sb: Client,
  text: Pick<ReadingText, "id" | "repetitions">,
  score: number,
  today: IsoDate,
): Promise<{ repetitions: number; dueDate: IsoDate }> {
  const next = scheduleText(text.repetitions, score, today);
  check(
    await sb
      .from("reading_texts")
      .update({
        repetitions: next.repetitions,
        due_date: next.dueDate,
        last_score: Math.round(score * 100) / 100,
        last_practiced_at: new Date().toISOString(),
      })
      .eq("id", text.id)
      .select("id"),
  );
  return next;
}

export async function deleteText(sb: Client, id: string): Promise<void> {
  check(await sb.from("reading_texts").delete().eq("id", id).select("id"));
}
