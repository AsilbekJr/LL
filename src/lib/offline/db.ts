import Dexie, { type EntityTable } from "dexie";
import type { AnswerWrite, LoadedSession } from "@/lib/session/api";
import type { SrsCard } from "@/lib/srs/types";

/**
 * One IndexedDB database for everything offline:
 *  - outbox:  answers waiting to be sent (in order)
 *  - session: the last loaded review session (so a session can start offline)
 *  - local:   what was answered on this device, applied on top of any
 *             session snapshot so done cards are not shown again
 *  - failed:  answers the database permanently rejected (e.g. the card was
 *             deleted meanwhile); kept for diagnosis so they never block the queue
 */
export interface OutboxRow {
  id?: number;
  createdAt: number;
  attempts: number;
  payload: AnswerWrite;
}

export interface FailedRow {
  id?: number;
  failedAt: number;
  error: string;
  code: string | null;
  payload: AnswerWrite;
}

export interface CachedSessionRow {
  key: "current";
  savedAt: number;
  session: SerializedSession;
}

/** LoadedSession with the Map turned into entries (IndexedDB can store Maps, JSON cannot). */
export type SerializedSession = Omit<LoadedSession, "load"> & { load: [string, number][] };

export type LocalRow =
  | { id?: number; at: string; kind: "card"; key: string; data: Partial<SrsCard> }
  | { id?: number; at: string; kind: "production"; key: string; data: { mode: "written" | "spoken" } };

export class OfflineDb extends Dexie {
  outbox!: EntityTable<OutboxRow, "id">;
  session!: EntityTable<CachedSessionRow, "key">;
  local!: EntityTable<LocalRow, "id">;
  failed!: EntityTable<FailedRow, "id">;

  constructor() {
    super("ll-offline");
    this.version(1).stores({ outbox: "++id, createdAt" });
    this.version(2).stores({ outbox: "++id, createdAt", session: "key", local: "++id, at" });
    this.version(3).stores({
      outbox: "++id, createdAt",
      session: "key",
      local: "++id, at",
      failed: "++id, failedAt",
    });
  }
}

let db: OfflineDb | null = null;

/** null on the server or where IndexedDB is unavailable (e.g. some private modes). */
export function getOfflineDb(): OfflineDb | null {
  if (typeof indexedDB === "undefined") return null;
  db ??= new OfflineDb();
  return db;
}
