import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk } from "@/lib/items/dedupe";
import { addDays, DEFAULT_TZ, startOfDayInTz, todayInTz, type IsoDate } from "@/lib/srs/dates";
import { buildDailyQueue, type DirectionMode } from "@/lib/srs/queue";
import type { ReviewOutcome } from "@/lib/srs/scheduler";
import {
  DEFAULT_SETTINGS,
  type FsrsState,
  type ReviewMethod,
  type ReviewResult,
  type SrsCard,
  type SrsSettings,
} from "@/lib/srs/types";
import type { Database, Json, Tables } from "@/lib/supabase/database.types";
import type { SessionCard, SessionItem } from "./exercise";

type Client = SupabaseClient<Database>;

const STUDIED = ["learning", "review", "mastered"] as const;
const ITEM_COLUMNS = "id, type, english, uzbek, example_en, example_uz, part_of_speech, notes";
const CARD_COLUMNS = `id, item_id, direction, stage, ladder_step, due_date, lapses, reps, status, fsrs_state, items(${ITEM_COLUMNS})`;
const LOAD_HORIZON_DAYS = 120;

type CardWithItem = Pick<
  Tables<"cards">,
  | "id"
  | "item_id"
  | "direction"
  | "stage"
  | "ladder_step"
  | "due_date"
  | "lapses"
  | "reps"
  | "status"
  | "fsrs_state"
> & { items: SessionItem | null };

export interface SessionConfig {
  settings: SrsSettings;
  today: IsoDate;
  directionMode: DirectionMode;
  ttsRate: number;
  ttsVoice: string | null;
}

export interface LoadedSession {
  config: SessionConfig;
  cards: SessionCard[];
  pool: SessionItem[];
  load: Map<IsoDate, number>;
  dueRemaining: number;
}

function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export function toSrsCard(row: Omit<CardWithItem, "items">): SrsCard {
  return {
    id: row.id,
    itemId: row.item_id,
    direction: row.direction,
    stage: row.stage,
    ladderStep: row.ladder_step,
    dueDate: row.due_date,
    lapses: row.lapses,
    reps: row.reps,
    status: row.status,
    fsrsState: (row.fsrs_state as FsrsState | null) ?? null,
  };
}

export function toSrsSettings(row: Partial<Tables<"settings">> | null): SrsSettings {
  return {
    ladder: row?.ladder ?? DEFAULT_SETTINGS.ladder,
    srsMode: row?.srs_mode ?? DEFAULT_SETTINGS.srsMode,
    overduePenalty: row?.overdue_penalty ?? DEFAULT_SETTINGS.overduePenalty,
    productionGateSteps: row?.production_gate_steps ?? DEFAULT_SETTINGS.productionGateSteps,
    maintenanceDays: row?.maintenance_days ?? DEFAULT_SETTINGS.maintenanceDays,
    timezone: row?.timezone ?? DEFAULT_TZ,
  };
}

export async function loadSession(sb: Client, now = new Date()): Promise<LoadedSession> {
  const settingsRow: Tables<"settings"> | null = check(await sb.from("settings").select("*").maybeSingle());
  const settings = toSrsSettings(settingsRow);
  const today = todayInTz(settings.timezone, now);
  const dayStart = startOfDayInTz(today, settings.timezone).toISOString();
  const newLimit = settingsRow?.daily_new_limit ?? 15;

  const [due, fresh, logs, upcoming] = await Promise.all([
    sb
      .from("cards")
      .select(CARD_COLUMNS)
      .in("status", [...STUDIED])
      .lte("due_date", today)
      .returns<CardWithItem[]>(),
    sb
      .from("cards")
      .select(CARD_COLUMNS)
      .eq("status", "new")
      .order("created_at")
      .limit(Math.max(4, newLimit * 2 + 10))
      .returns<CardWithItem[]>(),
    sb.from("review_logs").select("card_id, method, result").gte("reviewed_at", dayStart),
    sb
      .from("cards")
      .select("due_date")
      .in("status", [...STUDIED])
      .gt("due_date", today)
      .lte("due_date", addDays(today, LOAD_HORIZON_DAYS)),
  ]);

  const rows = [...check(due), ...check(fresh)].filter((r) => r.items);
  const todayLogs = check(logs);

  // What was already done today, so the daily limits hold across sessions.
  const encounteredCards = new Set(todayLogs.filter((l) => l.method === "encounter").map((l) => l.card_id));
  const reviewedCards = new Set(todayLogs.filter((l) => l.result !== null).map((l) => l.card_id));
  let newItemsDoneToday = 0;
  if (encounteredCards.size) {
    const enc = check(
      await sb
        .from("cards")
        .select("item_id")
        .in("id", [...encounteredCards]),
    );
    newItemsDoneToday = new Set(enc.map((c) => c.item_id)).size;
  }

  const queue = buildDailyQueue({
    cards: rows.map((r) => ({ ...r, itemId: r.item_id, dueDate: r.due_date })),
    today,
    newLimit,
    reviewLimit: settingsRow?.daily_review_limit ?? 150,
    newItemsDoneToday,
    reviewsDoneToday: reviewedCards.size,
    directionMode: settingsRow?.direction_mode ?? "random",
  });

  // Siblings (other direction) and production progress for every item in the queue.
  const itemIds = [...new Set(queue.queue.map((c) => c.item_id))];
  const siblings: Pick<Tables<"cards">, "id" | "item_id" | "direction" | "ladder_step">[] = [];
  const productions: Pick<Tables<"productions">, "item_id" | "mode">[] = [];
  for (const ids of chunk(itemIds, 300)) {
    const [s, p] = await Promise.all([
      sb.from("cards").select("id, item_id, direction, ladder_step").in("item_id", ids),
      sb.from("productions").select("item_id, mode").in("item_id", ids).eq("passed", true),
    ]);
    siblings.push(...check(s));
    productions.push(...check(p));
  }

  const ladderLength = settings.ladder.length;
  const cards: SessionCard[] = queue.queue.map((row) => {
    const sib = siblings.find((s) => s.item_id === row.item_id && s.direction !== row.direction) ?? null;
    const prods = productions.filter((p) => p.item_id === row.item_id);
    return {
      card: toSrsCard(row),
      item: row.items!,
      production: {
        writtenPassed: prods.some((p) => p.mode === "written"),
        spokenPassed: prods.some((p) => p.mode === "spoken"),
      },
      siblingComplete: (sib?.ladder_step ?? 0) >= ladderLength,
      siblingId: sib?.id ?? null,
    };
  });

  // Distractor pool: recent items plus everything in the session.
  const recent = check(
    await sb
      .from("items")
      .select(ITEM_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<SessionItem[]>(),
  );
  const pool = new Map<string, SessionItem>();
  for (const i of [...recent, ...cards.map((c) => c.item)]) pool.set(i.id, i);

  const load = new Map<IsoDate, number>();
  for (const r of check(upcoming)) load.set(r.due_date, (load.get(r.due_date) ?? 0) + 1);

  return {
    config: {
      settings,
      today,
      directionMode: settingsRow?.direction_mode ?? "random",
      ttsRate: Number(settingsRow?.tts_rate ?? 1),
      ttsVoice: settingsRow?.tts_voice ?? null,
    },
    cards,
    pool: [...pool.values()],
    load,
    dueRemaining: queue.dueRemaining,
  };
}

/** One answer, ready to be written. `clientId` makes retries idempotent. */
export interface AnswerWrite {
  clientId: string;
  reviewedAt: string;
  method: ReviewMethod;
  result: ReviewResult | null;
  responseText: string | null;
  responseMs: number | null;
  outcome: ReviewOutcome;
  siblingPatch: { id: string; status: "mastered"; dueDate: IsoDate } | null;
}

export async function persistAnswer(sb: Client, w: AnswerWrite): Promise<void> {
  const c = w.outcome.card;
  // Log first (idempotent on client_id), then the card state.
  const log = await sb.from("review_logs").upsert(
    {
      card_id: c.id,
      client_id: w.clientId,
      reviewed_at: w.reviewedAt,
      method: w.method,
      result: w.result,
      response_text: w.responseText?.slice(0, 4000) ?? null,
      response_ms: w.responseMs,
      was_overdue: w.outcome.log.wasOverdue,
      overdue_days: w.outcome.log.overdueDays,
      ladder_step_before: w.outcome.log.ladderStepBefore,
      ladder_step_after: w.outcome.log.ladderStepAfter,
      interval_days: w.outcome.log.intervalDays,
    },
    { onConflict: "client_id", ignoreDuplicates: true },
  );
  if (log.error) throw new Error(log.error.message);

  const card = await sb
    .from("cards")
    .update({
      stage: c.stage,
      ladder_step: c.ladderStep,
      due_date: c.dueDate,
      lapses: c.lapses,
      reps: c.reps,
      status: c.status,
      fsrs_state: (c.fsrsState ?? null) as Json | null,
      last_reviewed_at: w.result === null ? undefined : w.reviewedAt,
    })
    .eq("id", c.id);
  if (card.error) throw new Error(card.error.message);

  if (w.siblingPatch) {
    const sib = await sb
      .from("cards")
      .update({ status: w.siblingPatch.status, due_date: w.siblingPatch.dueDate })
      .eq("id", w.siblingPatch.id);
    if (sib.error) throw new Error(sib.error.message);
  }
}
