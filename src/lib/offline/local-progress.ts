import { dayInTz, type IsoDate } from "@/lib/srs/dates";
import type { AnswerWrite, LoadedSession } from "@/lib/session/api";
import type { SrsCard } from "@/lib/srs/types";
import type { LocalRow, SerializedSession } from "./db";

/**
 * Pure helpers (no IndexedDB) for offline sessions — unit tested.
 */

export function serializeSession(s: LoadedSession): SerializedSession {
  return { ...s, load: [...s.load.entries()] };
}

export function deserializeSession(s: SerializedSession): LoadedSession {
  return { ...s, load: new Map(s.load) };
}

/** What one answer changed locally: the card, a mastered sibling, a passed production. */
export function localRowsFromAnswer(w: AnswerWrite): LocalRow[] {
  const rows: LocalRow[] = [{ at: w.reviewedAt, kind: "card", key: w.outcome.card.id, data: w.outcome.card }];
  if (w.siblingPatch) {
    rows.push({
      at: w.reviewedAt,
      kind: "card",
      key: w.siblingPatch.id,
      data: { status: w.siblingPatch.status, dueDate: w.siblingPatch.dueDate },
    });
  }
  if (w.production?.passed) {
    rows.push({
      at: w.reviewedAt,
      kind: "production",
      key: w.production.itemId,
      data: { mode: w.production.mode },
    });
  }
  return rows;
}

/**
 * Applies today's local answers on top of a session snapshot (cached or
 * freshly loaded while answers are still waiting in the outbox):
 *  - a card answered and scheduled for a later day is removed,
 *  - a card still due today (Again / encounter) keeps its new state,
 *  - productions passed offline count for the gate.
 * Idempotent: applying rows the server already has changes nothing.
 */
export function applyLocalProgress(
  session: LoadedSession,
  rows: readonly LocalRow[],
  timezone: string,
): LoadedSession {
  const today: IsoDate = session.config.today;
  const cardPatch = new Map<string, Partial<SrsCard>>();
  const prod = new Map<string, { written: boolean; spoken: boolean }>();

  const todays = rows
    .filter((r) => dayInTz(new Date(r.at), timezone) === today)
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const r of todays) {
    if (r.kind === "card") {
      cardPatch.set(r.key, { ...cardPatch.get(r.key), ...r.data });
    } else {
      const p = prod.get(r.key) ?? { written: false, spoken: false };
      if (r.data.mode === "written") p.written = true;
      else p.spoken = true;
      prod.set(r.key, p);
    }
  }
  if (cardPatch.size === 0 && prod.size === 0) return session;

  const cards = session.cards.flatMap((sc) => {
    const patch = cardPatch.get(sc.card.id);
    const card = patch ? { ...sc.card, ...patch } : sc.card;
    if (card.dueDate > today) return [];
    const p = prod.get(sc.card.itemId);
    const production = p
      ? {
          writtenPassed: sc.production.writtenPassed || p.written,
          spokenPassed: sc.production.spokenPassed || p.spoken,
        }
      : sc.production;
    return [{ ...sc, card, production }];
  });
  return { ...session, cards };
}

/** A cached snapshot is only usable on the same calendar day it was made for. */
export function isSnapshotUsable(s: SerializedSession, now: Date): boolean {
  return dayInTz(now, s.config.settings.timezone) === s.config.today;
}

/** fetch() failures (offline, DNS, CORS) — as opposed to server / RLS errors. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /fetch|network|offline|load failed/i.test(msg);
}
