import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TZ, todayInTz } from "@/lib/srs/dates";
import type { Database, Tables, TablesInsert } from "@/lib/supabase/database.types";
import { englishKey, type ItemDraft } from "@/lib/schemas/item";
import type { ParsedPack } from "@/lib/schemas/pack";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  planRestore,
  stripUser,
  type BackupFile,
  type backupSchema,
} from "@/lib/schemas/backup";
import type { z } from "zod";
import { chunk, dedupeItems } from "./dedupe";
import { resumePlan, type LibraryItem } from "./library";

/**
 * All Supabase reads/writes for items, packs and backups. Every call runs as
 * the signed-in user, so RLS limits it to their own rows.
 */
type Client = SupabaseClient<Database>;

const PAGE = 1000; // PostgREST default max rows per request
const WRITE_CHUNK = 500;
const LIBRARY_COLUMNS = "*, cards(id, direction, status, due_date, reps, ladder_step, lapses)";

export class ItemsApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

function fail(error: { message: string; code?: string } | null, fallback: string): never {
  if (error?.code === "23505") throw new ItemsApiError("Bu so'z kutubxonada allaqachon bor", error.code);
  throw new ItemsApiError(error?.message || fallback, error?.code);
}

/** Read every row of a query, page by page. */
async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) fail(error, "Ma'lumotni o'qib bo'lmadi");
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export async function fetchToday(sb: Client): Promise<string> {
  const { data } = await sb.from("settings").select("timezone").maybeSingle();
  return todayInTz(data?.timezone ?? DEFAULT_TZ);
}

export function fetchLibrary(sb: Client): Promise<LibraryItem[]> {
  return readAll((from, to) =>
    sb
      .from("items")
      .select(LIBRARY_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
      .returns<LibraryItem[]>(),
  );
}

/** lower(trim(english)) of every item, for duplicate checks before insert. */
export async function fetchExistingKeys(sb: Client): Promise<Set<string>> {
  const rows = await readAll((from, to) => sb.from("items").select("english").order("id").range(from, to));
  return new Set(rows.map((r) => englishKey(r.english)));
}

export async function scheduleItems(sb: Client, itemIds: string[]): Promise<number> {
  let created = 0;
  for (const ids of chunk(itemIds, WRITE_CHUNK)) {
    const { data, error } = await sb.rpc("schedule_items", { p_item_ids: ids });
    if (error) fail(error, "Takrorlashga qo'shib bo'lmadi");
    created += data ?? 0;
  }
  return created;
}

export interface AddResult {
  inserted: number;
  duplicates: number;
  scheduledCards: number;
  insertedIds: string[];
}

/** Insert new items (duplicates are skipped) and optionally schedule them. */
/**
 * Only real `items` columns go to the database. Drafts can carry UI-only
 * fields (e.g. the pasted-list parser adds `line`), and PostgREST rejects
 * unknown columns — which once broke "paste a list" in production.
 */
export function draftColumns(d: ItemDraft) {
  return {
    type: d.type,
    english: d.english,
    uzbek: d.uzbek,
    cefr_level: d.cefr_level,
    part_of_speech: d.part_of_speech,
    example_en: d.example_en,
    example_uz: d.example_uz,
    notes: d.notes,
    tags: d.tags,
  } satisfies TablesInsert<"items">;
}

export async function addItems(
  sb: Client,
  drafts: ItemDraft[],
  opts: { schedule: boolean; packId?: string | null; source?: "manual" | "import" },
): Promise<AddResult> {
  const existing = await fetchExistingKeys(sb);
  const { fresh, existing: dupes, repeated } = dedupeItems(drafts, existing);

  const insertedIds: string[] = [];
  for (const part of chunk(fresh, WRITE_CHUNK)) {
    const rows: TablesInsert<"items">[] = part.map((d) => ({
      ...draftColumns(d),
      source: opts.source ?? "manual",
      pack_id: opts.packId ?? null,
    }));
    const { data, error } = await sb.from("items").insert(rows).select("id");
    if (error) fail(error, "Saqlab bo'lmadi");
    insertedIds.push(...(data ?? []).map((r) => r.id));
  }

  const scheduledCards = opts.schedule && insertedIds.length ? await scheduleItems(sb, insertedIds) : 0;
  return {
    inserted: insertedIds.length,
    duplicates: dupes.length + repeated.length,
    scheduledCards,
    insertedIds,
  };
}

export async function updateItem(sb: Client, id: string, draft: ItemDraft): Promise<void> {
  const { error } = await sb.from("items").update(draftColumns(draft)).eq("id", id);
  if (error) fail(error, "Saqlab bo'lmadi");
}

export async function deleteItems(sb: Client, ids: string[]): Promise<void> {
  for (const part of chunk(ids, WRITE_CHUNK)) {
    const { error } = await sb.from("items").delete().in("id", part);
    if (error) fail(error, "O'chirib bo'lmadi");
  }
}

export async function suspendItems(sb: Client, ids: string[]): Promise<void> {
  for (const part of chunk(ids, WRITE_CHUNK)) {
    const { error } = await sb.from("cards").update({ status: "suspended" }).in("item_id", part);
    if (error) fail(error, "To'xtatib bo'lmadi");
  }
}

/** Un-suspend: studied cards go back to review (due today), never-studied ones to new. */
export async function resumeItems(sb: Client, ids: string[]): Promise<void> {
  const today = await fetchToday(sb);
  for (const part of chunk(ids, WRITE_CHUNK)) {
    const { data, error } = await sb.from("cards").select("id, status, reps").in("item_id", part);
    if (error) fail(error, "Davom ettirib bo'lmadi");
    const plan = resumePlan(data ?? []);
    if (plan.toReview.length) {
      const r = await sb.from("cards").update({ status: "review", due_date: today }).in("id", plan.toReview);
      if (r.error) fail(r.error, "Davom ettirib bo'lmadi");
    }
    if (plan.toNew.length) {
      const r = await sb.from("cards").update({ status: "new", due_date: today }).in("id", plan.toNew);
      if (r.error) fail(r.error, "Davom ettirib bo'lmadi");
    }
  }
}

export interface ImportResult extends AddResult {
  packId: string;
}

export async function importPack(
  sb: Client,
  pack: ParsedPack,
  opts: { schedule: boolean },
): Promise<ImportResult> {
  const { data: packRow, error } = await sb
    .from("packs")
    .insert({ name: pack.name, cefr_level: pack.cefr_level, description: pack.description })
    .select("id")
    .single();
  if (error || !packRow) fail(error, "To'plamni yaratib bo'lmadi");

  const result = await addItems(sb, pack.items, {
    schedule: opts.schedule,
    packId: packRow.id,
    source: "import",
  });
  await sb.from("packs").update({ item_count: result.inserted }).eq("id", packRow.id);
  return { ...result, packId: packRow.id };
}

// ---------- backup ---------------------------------------------------

export async function exportBackup(sb: Client): Promise<BackupFile> {
  const byId = <T extends "packs" | "items" | "cards" | "review_logs" | "productions">(table: T) =>
    readAll<Tables<T>>((from, to) =>
      sb.from(table).select("*").order("id").range(from, to).returns<Tables<T>[]>(),
    );

  const [packs, items, cards, review_logs, productions, settings] = await Promise.all([
    byId("packs"),
    byId("items"),
    byId("cards"),
    byId("review_logs"),
    byId("productions"),
    sb.from("settings").select("*").maybeSingle(),
  ]);
  if (settings.error) fail(settings.error, "Sozlamalarni o'qib bo'lmadi");

  const { user_id: _u, ...ownSettings } = settings.data ?? { user_id: null };
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    data: {
      packs: stripUser(packs),
      items: stripUser(items),
      cards: stripUser(cards),
      review_logs: stripUser(review_logs),
      productions: stripUser(productions),
      settings: settings.data ? (ownSettings as BackupFile["data"]["settings"]) : null,
    },
  };
}

export interface RestoreResult {
  items: number;
  cards: number;
  skippedItems: number;
  settings: boolean;
}

/** Merge a backup into the library. Existing rows are never overwritten. */
export async function restoreBackup(
  sb: Client,
  file: z.infer<typeof backupSchema>,
  opts: { settings: boolean },
): Promise<RestoreResult> {
  const plan = planRestore(file.data, await fetchExistingKeys(sb), englishKey);

  // user_id is filled by the column default (auth.uid()); ids are kept so links survive.
  const insert = async (
    table: "packs" | "items" | "cards" | "review_logs" | "productions",
    rows: object[],
  ) => {
    for (const part of chunk(stripUser(rows as { user_id?: unknown }[]), WRITE_CHUNK)) {
      const { error } = await sb
        .from(table)
        .upsert(part as never, { onConflict: "id", ignoreDuplicates: true });
      if (error) fail(error, "Tiklab bo'lmadi");
    }
  };

  await insert("packs", plan.packs);
  await insert("items", plan.items);
  await insert("cards", plan.cards);
  await insert("review_logs", plan.review_logs);
  await insert("productions", plan.productions);

  let settingsRestored = false;
  if (opts.settings && file.data.settings) {
    const { user_id: _u, updated_at: _t, ...s } = file.data.settings as Record<string, unknown>;
    const { error } = await sb
      .from("settings")
      .update(s as never)
      .not("user_id", "is", null);
    if (error) fail(error, "Sozlamalarni tiklab bo'lmadi");
    settingsRestored = true;
  }

  return {
    items: plan.items.length,
    cards: plan.cards.length,
    skippedItems: plan.skippedItems,
    settings: settingsRestored,
  };
}
