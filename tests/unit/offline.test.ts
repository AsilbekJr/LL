import { describe, expect, it } from "vitest";
import type { LocalRow, SerializedSession } from "@/lib/offline/db";
import {
  applyLocalProgress,
  deserializeSession,
  isNetworkError,
  isSnapshotUsable,
  localRowsFromAnswer,
  serializeSession,
} from "@/lib/offline/local-progress";
import type { AnswerWrite, LoadedSession } from "@/lib/session/api";
import type { SessionCard } from "@/lib/session/exercise";
import { DEFAULT_SETTINGS, type SrsCard } from "@/lib/srs/types";

const TZ = "Asia/Tashkent";
const TODAY = "2026-11-06";

function card(id: string, over: Partial<SrsCard> = {}): SrsCard {
  return {
    id,
    itemId: `item-${id}`,
    direction: "en_uz",
    stage: 3,
    ladderStep: 2,
    dueDate: TODAY,
    lapses: 0,
    reps: 3,
    status: "review",
    fsrsState: null,
    ...over,
  };
}

function sessionCard(c: SrsCard): SessionCard {
  return {
    card: c,
    item: { id: c.itemId } as SessionCard["item"],
    production: { writtenPassed: false, spokenPassed: false },
    siblingComplete: false,
    siblingId: null,
  };
}

function session(cards: SrsCard[]): LoadedSession {
  return {
    config: {
      settings: { ...DEFAULT_SETTINGS, timezone: TZ },
      today: TODAY,
      ttsRate: 1,
      ttsVoice: null,
    },
    cards: cards.map(sessionCard),
    pool: [],
    load: new Map([["2026-11-07", 4]]),
    dueRemaining: 0,
  };
}

const at = (hhmm: string, day = TODAY) => new Date(`${day}T${hhmm}:00+05:00`).toISOString();

describe("offline: applying local answers to a session snapshot", () => {
  it("drops a card answered today and scheduled for a later day", () => {
    const rows: LocalRow[] = [
      { at: at("09:00"), kind: "card", key: "a", data: card("a", { dueDate: "2026-11-13" }) },
    ];
    const out = applyLocalProgress(session([card("a"), card("b")]), rows, TZ);
    expect(out.cards.map((c) => c.card.id)).toEqual(["b"]);
  });

  it("keeps a card still due today (Again) with its new state", () => {
    const rows: LocalRow[] = [
      {
        at: at("09:00"),
        kind: "card",
        key: "a",
        data: card("a", { ladderStep: 0, status: "learning", lapses: 1 }),
      },
    ];
    const out = applyLocalProgress(session([card("a")]), rows, TZ);
    expect(out.cards[0]?.card).toMatchObject({ ladderStep: 0, status: "learning", lapses: 1 });
  });

  it("applies rows in time order (latest state wins)", () => {
    const rows: LocalRow[] = [
      { at: at("10:00"), kind: "card", key: "a", data: card("a", { dueDate: "2026-11-09", ladderStep: 3 }) },
      { at: at("09:00"), kind: "card", key: "a", data: card("a", { ladderStep: 0 }) },
    ];
    expect(applyLocalProgress(session([card("a")]), rows, TZ).cards).toHaveLength(0);
  });

  it("ignores answers from another (Tashkent) day", () => {
    const rows: LocalRow[] = [
      // 23:30 on the 5th in Tashkent — yesterday, even though it is the 5th 18:30 UTC
      { at: at("23:30", "2026-11-05"), kind: "card", key: "a", data: card("a", { dueDate: "2026-11-20" }) },
    ];
    expect(applyLocalProgress(session([card("a")]), rows, TZ).cards).toHaveLength(1);
  });

  it("a mastered sibling patch removes the sibling from today's session", () => {
    const w = {
      clientId: "x",
      reviewedAt: at("09:00"),
      method: "recall",
      result: "good",
      responseText: null,
      responseMs: 1000,
      outcome: { card: card("a", { dueDate: "2027-05-05", status: "mastered" }) },
      siblingPatch: { id: "b", status: "mastered", dueDate: "2027-05-05" },
      production: null,
    } as unknown as AnswerWrite;
    const rows = localRowsFromAnswer(w);
    expect(rows).toHaveLength(2);
    expect(applyLocalProgress(session([card("a"), card("b")]), rows, TZ).cards).toHaveLength(0);
  });

  it("a production passed offline counts for the gate", () => {
    const w = {
      clientId: "x",
      reviewedAt: at("09:00"),
      method: "writing",
      result: "good",
      responseText: "I am reliable.",
      responseMs: 1000,
      outcome: { card: card("a") },
      siblingPatch: null,
      production: {
        clientId: "p",
        itemId: "item-a",
        mode: "written",
        exercise: "sentence",
        text: "x",
        passed: true,
      },
    } as unknown as AnswerWrite;
    const out = applyLocalProgress(session([card("a")]), localRowsFromAnswer(w), TZ);
    expect(out.cards[0]?.production).toEqual({ writtenPassed: true, spokenPassed: false });
  });

  it("returns the same session when nothing applies", () => {
    const s = session([card("a")]);
    expect(applyLocalProgress(s, [], TZ)).toBe(s);
  });
});

describe("offline: snapshot", () => {
  it("serializes the load map and restores it", () => {
    const s = session([card("a")]);
    const back = deserializeSession(JSON.parse(JSON.stringify(serializeSession(s))) as SerializedSession);
    expect(back.load.get("2026-11-07")).toBe(4);
    expect(back.cards[0]?.card.id).toBe("a");
  });

  it("is only usable on the same Tashkent day", () => {
    const snap = serializeSession(session([]));
    expect(isSnapshotUsable(snap, new Date(at("23:59")))).toBe(true);
    expect(isSnapshotUsable(snap, new Date(at("00:00", "2026-11-07")))).toBe(false);
  });

  it("recognises network failures", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkError(new Error("permission denied for table cards"))).toBe(false);
  });
});
