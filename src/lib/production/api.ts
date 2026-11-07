import { DbWriteError } from "@/lib/supabase/write-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import type { AiFeedback } from "./feedback";

type Client = SupabaseClient<Database>;

export interface ProductionWrite {
  clientId: string;
  itemId: string;
  cardId?: string | null;
  mode: "written" | "spoken";
  exercise: "sentence" | "situation" | "shadowing" | "drill" | "pattern" | "translation";
  context?: string | null;
  prompt?: string | null;
  text: string;
  passed: boolean;
  durationMs?: number | null;
  drillId?: string | null;
  aiFeedback?: AiFeedback | null;
}

function toRow(p: ProductionWrite): TablesInsert<"productions"> {
  return {
    client_id: p.clientId,
    item_id: p.itemId,
    card_id: p.cardId ?? null,
    mode: p.mode,
    exercise: p.exercise,
    context: p.context ?? null,
    prompt: p.prompt ?? null,
    text: p.text.trim().slice(0, 8000),
    passed: p.passed,
    duration_ms: p.durationMs ?? null,
    drill_id: p.drillId ?? null,
    ai_feedback: (p.aiFeedback ?? null) as Json | null,
    corrected_text: p.aiFeedback?.corrected ?? null,
  };
}

/** Insert productions; idempotent on client_id so retries never duplicate. */
export async function saveProductions(sb: Client, writes: ProductionWrite[]): Promise<void> {
  const rows = writes.filter((w) => w.text.trim()).map(toRow);
  if (!rows.length) return;
  const { error } = await sb
    .from("productions")
    .upsert(rows, { onConflict: "client_id", ignoreDuplicates: true });
  if (error) throw new DbWriteError(error);
}

export type MasteredItem = Pick<
  Tables<"items">,
  "id" | "english" | "uzbek" | "type" | "cefr_level" | "example_en"
> & {
  productions: Pick<
    Tables<"productions">,
    "id" | "mode" | "exercise" | "text" | "passed" | "created_at" | "context"
  >[];
};

/** Mastered items (mastery promotes both cards together), newest first, with the learner's own sentences. */
export async function fetchMastered(sb: Client): Promise<MasteredItem[]> {
  const { data, error } = await sb
    .from("items")
    .select(
      "id, english, uzbek, type, cefr_level, example_en, cards!inner(status), productions(id, mode, exercise, text, passed, created_at, context)",
    )
    .eq("cards.status", "mastered")
    .order("updated_at", { ascending: false })
    .limit(1000)
    .returns<(MasteredItem & { cards: { status: string }[] })[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ cards: _c, ...item }) => ({
    ...item,
    productions: [...item.productions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
  }));
}

export type DrillItem = Pick<
  Tables<"items">,
  "id" | "english" | "uzbek" | "type" | "example_en" | "part_of_speech" | "cefr_level"
>;

/** Items being learned or mastered, for free speaking drills and shadowing. */
export async function fetchPracticeItems(sb: Client, limit = 200): Promise<DrillItem[]> {
  const { data, error } = await sb
    .from("items")
    .select("id, english, uzbek, type, example_en, part_of_speech, cefr_level, cards!inner(status)")
    .in("cards.status", ["learning", "review", "mastered"])
    .order("updated_at", { ascending: false })
    .limit(limit)
    .returns<(DrillItem & { cards: unknown })[]>();
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  return (data ?? [])
    .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .map(({ cards: _c, ...i }) => i);
}

export type SpokenUse = Pick<Tables<"productions">, "item_id" | "created_at">;

/** Passed spoken productions (not shadowing) — the input for "active vocabulary". */
export async function fetchSpokenUses(sb: Client): Promise<SpokenUse[]> {
  const { data, error } = await sb
    .from("productions")
    .select("item_id, created_at")
    .eq("passed", true)
    .eq("mode", "spoken")
    .neq("exercise", "shadowing")
    .order("created_at", { ascending: false })
    .limit(20000);
  if (error) throw new Error(error.message);
  return data ?? [];
}
