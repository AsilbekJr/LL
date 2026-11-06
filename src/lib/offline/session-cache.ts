import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSession, type LoadedSession } from "@/lib/session/api";
import type { Database } from "@/lib/supabase/database.types";
import { getOfflineDb, type LocalRow } from "./db";
import {
  applyLocalProgress,
  deserializeSession,
  isNetworkError,
  isSnapshotUsable,
  serializeSession,
} from "./local-progress";

type Client = SupabaseClient<Database>;

export class NoOfflineSessionError extends Error {
  constructor() {
    super("no-offline-session");
    this.name = "NoOfflineSessionError";
  }
}

/** Snapshots older than this are refreshed in the background when online. */
const PREFETCH_EVERY_MS = 20 * 60 * 1000;
const KEEP_LOCAL_MS = 3 * 24 * 60 * 60 * 1000;

async function readLocalRows(): Promise<LocalRow[]> {
  const db = getOfflineDb();
  return db ? db.local.toArray() : [];
}

export async function recordLocalRows(rows: LocalRow[]): Promise<void> {
  const db = getOfflineDb();
  if (db && rows.length) await db.local.bulkAdd(rows);
}

async function saveSnapshot(s: LoadedSession, now: Date): Promise<void> {
  const db = getOfflineDb();
  if (!db) return;
  await db.session.put({ key: "current", savedAt: now.getTime(), session: serializeSession(s) });
  await db.local
    .where("at")
    .below(new Date(now.getTime() - KEEP_LOCAL_MS).toISOString())
    .delete();
}

/**
 * Loads today's session. Online: from Supabase (and refreshes the offline
 * snapshot). Offline: from the snapshot made earlier today. Either way the
 * answers given on this device today are applied on top.
 */
export async function loadSessionOfflineFirst(
  sb: Client,
  now = new Date(),
): Promise<LoadedSession & { offline: boolean }> {
  let session: LoadedSession;
  let offline = false;
  try {
    session = await loadSession(sb, now);
    void saveSnapshot(session, now).catch(() => undefined);
  } catch (e) {
    if (typeof navigator !== "undefined" && navigator.onLine && !isNetworkError(e)) throw e;
    const cached = await getOfflineDb()?.session.get("current");
    if (!cached || !isSnapshotUsable(cached.session, now)) throw new NoOfflineSessionError();
    session = deserializeSession(cached.session);
    offline = true;
  }
  const rows = await readLocalRows().catch(() => []);
  return { ...applyLocalProgress(session, rows, session.config.settings.timezone), offline };
}

/**
 * Background refresh while online so a session can be started later without
 * internet. Also warms the service-worker cache for the review page.
 */
export async function prefetchOfflineSession(sb: Client, now = new Date()): Promise<void> {
  const db = getOfflineDb();
  if (!db || !navigator.onLine) return;
  const cached = await db.session.get("current");
  if (cached && isSnapshotUsable(cached.session, now) && now.getTime() - cached.savedAt < PREFETCH_EVERY_MS)
    return;
  const session = await loadSession(sb, now);
  await saveSnapshot(session, now);
  await fetch("/takrorlash", { credentials: "same-origin" }).catch(() => undefined);
}
