import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { persistAnswer, type AnswerWrite } from "@/lib/session/api";
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
 */

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
  flushing ??= (async () => {
    try {
      const d = getOfflineDb();
      while (memory.length) {
        await persistAnswer(sb, memory[0]!);
        memory.shift();
      }
      if (!d) return true;
      for (;;) {
        const next = await d.outbox.orderBy("createdAt").first();
        if (!next) return true;
        try {
          await persistAnswer(sb, next.payload);
        } catch (e) {
          await d.outbox.update(next.id!, { attempts: next.attempts + 1 });
          throw e;
        }
        await d.outbox.delete(next.id!);
        await notify();
      }
    } catch {
      return false;
    } finally {
      flushing = null;
      await notify();
    }
  })();
  return flushing;
}
