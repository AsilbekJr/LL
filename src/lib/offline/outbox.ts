import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { persistAnswer, type AnswerWrite } from "@/lib/session/api";
import { DbWriteError, isPermanentWriteError } from "@/lib/supabase/write-error";
import { getOfflineDb } from "./db";
import { localRowsFromAnswer } from "./local-progress";
import { recordLocalRows } from "./session-cache";

/**
 * Offline outbox: every review answer is written to IndexedDB first, then
 * sent to Supabase in order. If the network or the tab goes away, the
 * answers survive and are sent on the next app start or reconnect.
 * Sends are idempotent (review_logs / productions upsert on client_id), and
 * the database ignores a card update that is older than the card's last
 * review (see migration *_offline_sync_guard.sql), so a late-synced answer
 * from another device can never overwrite newer progress.
 * An answer the database rejects for good (e.g. its card was deleted
 * meanwhile) is moved to the `failed` table instead of being retried
 * forever, so one bad row can never block every later answer.
 */

/** Failed rows older than this are dropped (they are only kept for diagnosis). */
const FAILED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

export function onOutboxChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function notify() {
  const n = await pendingCount();
  for (const fn of listeners) fn(n);
}

/** Memory-only fallback when IndexedDB is unavailable. */
const memory: AnswerWrite[] = [];

export async function pendingCount(): Promise<number> {
  const d = getOfflineDb();
  return (d ? await d.outbox.count() : 0) + memory.length;
}

/** Queue an answer (survives reloads) and remember its effect for offline sessions. */
export async function enqueue(payload: AnswerWrite): Promise<void> {
  const d = getOfflineDb();
  if (d) {
    await d.transaction("rw", d.outbox, d.local, async () => {
      await d.outbox.add({ createdAt: Date.now(), attempts: 0, payload });
      await recordLocalRows(localRowsFromAnswer(payload));
    });
  } else {
    memory.push(payload);
  }
  await notify();
}

let flushing: Promise<boolean> | null = null;

/**
 * Send queued answers in order. Returns true when the queue is empty.
 * Concurrent calls share one run.
 */
export function flushOutbox(sb: SupabaseClient<Database>): Promise<boolean> {
  // The run may finish synchronously-fast (empty queue); clear the shared
  // promise only after it is assigned, or a stale resolved promise would
  // turn every later flush into a no-op.
  flushing ??= runFlush(sb).finally(() => {
    flushing = null;
  });
  return flushing;
}

async function runFlush(sb: SupabaseClient<Database>): Promise<boolean> {
  try {
    const d = getOfflineDb();
    while (memory.length) {
      try {
        await persistAnswer(sb, memory[0]!);
      } catch (e) {
        if (!isPermanentWriteError(e)) throw e;
        console.warn("[outbox] dropped a rejected answer", e);
      }
      memory.shift();
    }
    if (!d) return true;
    for (;;) {
      const next = await d.outbox.orderBy("createdAt").first();
      if (!next) return true;
      try {
        await persistAnswer(sb, next.payload);
        await d.outbox.delete(next.id!);
      } catch (e) {
        if (!isPermanentWriteError(e)) {
          await d.outbox.update(next.id!, { attempts: next.attempts + 1 });
          throw e;
        }
        await d.transaction("rw", d.outbox, d.failed, async () => {
          await d.failed.add({
            failedAt: Date.now(),
            error: e instanceof Error ? e.message : String(e),
            code: e instanceof DbWriteError ? (e.code ?? null) : null,
            payload: next.payload,
          });
          await d.outbox.delete(next.id!);
        });
        console.warn("[outbox] moved a rejected answer to `failed`", e);
      }
      await notify();
    }
  } catch {
    return false;
  } finally {
    void pruneFailed();
    await notify();
  }
}

async function pruneFailed(): Promise<void> {
  const d = getOfflineDb();
  if (!d) return;
  try {
    await d.failed
      .where("failedAt")
      .below(Date.now() - FAILED_KEEP_MS)
      .delete();
  } catch {
    // diagnosis data only
  }
}
