import type { IsoDate } from "@/lib/srs/dates";
import type { CardStatus, CefrLevel, ItemType, Tables } from "@/lib/supabase/database.types";

/** An item with the scheduling fields of its cards (library row). */
export type LibraryItem = Tables<"items"> & {
  cards: Pick<Tables<"cards">, "id" | "direction" | "status" | "due_date" | "reps" | "ladder_step">[];
};

/**
 * Item-level status shown in the library:
 * - library   — not scheduled yet (no cards)
 * - new       — scheduled, never studied
 * - learning  — at least one card being studied
 * - mastered  — every active card mastered
 * - suspended — every card suspended
 */
export type ItemStatus = "library" | "new" | "learning" | "mastered" | "suspended";

const STUDIED: ReadonlySet<CardStatus> = new Set(["learning", "review", "mastered"]);

export function itemStatus(cards: Pick<LibraryItem["cards"][number], "status">[]): ItemStatus {
  if (cards.length === 0) return "library";
  const active = cards.filter((c) => c.status !== "suspended");
  if (active.length === 0) return "suspended";
  if (active.every((c) => c.status === "mastered")) return "mastered";
  if (active.some((c) => c.status === "learning" || c.status === "review")) return "learning";
  return "new";
}

export function isItemOverdue(
  cards: Pick<LibraryItem["cards"][number], "status" | "due_date">[],
  today: IsoDate,
): boolean {
  return cards.some((c) => STUDIED.has(c.status) && c.due_date < today);
}

export interface LibraryFilter {
  query?: string;
  status?: ItemStatus | "all";
  type?: ItemType | "all";
  cefr?: CefrLevel | "all";
  tag?: string | "all";
  overdueOnly?: boolean;
}

export type LibrarySort = "newest" | "oldest" | "az";

function fold(s: string): string {
  // Case-, accent- and apostrophe-insensitive (o', o', oʻ all match).
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ʻʼ‘’`']/g, "'");
}

export function filterLibrary<T extends LibraryItem>(
  items: T[],
  filter: LibraryFilter,
  today: IsoDate,
  sort: LibrarySort = "newest",
): T[] {
  const q = fold(filter.query?.trim() ?? "");
  const out = items.filter((i) => {
    if (q && !fold(`${i.english} ${i.uzbek} ${i.tags.join(" ")}`).includes(q)) return false;
    if (filter.type && filter.type !== "all" && i.type !== filter.type) return false;
    if (filter.cefr && filter.cefr !== "all" && i.cefr_level !== filter.cefr) return false;
    if (filter.tag && filter.tag !== "all" && !i.tags.includes(filter.tag)) return false;
    if (filter.status && filter.status !== "all" && itemStatus(i.cards) !== filter.status) return false;
    if (filter.overdueOnly && !isItemOverdue(i.cards, today)) return false;
    return true;
  });
  return out.sort((a, b) => {
    if (sort === "az") return a.english.localeCompare(b.english, "en", { sensitivity: "base" });
    const d = a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
    return sort === "oldest" ? d : -d;
  });
}

/** All tags used in the library, most frequent first. */
export function collectTags(items: Pick<LibraryItem, "tags">[]): string[] {
  const counts = new Map<string, number>();
  for (const i of items) for (const t of i.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** Cards to un-suspend, split by whether they were ever studied. */
export function resumePlan(cards: Pick<Tables<"cards">, "id" | "status" | "reps">[]) {
  const suspended = cards.filter((c) => c.status === "suspended");
  return {
    toReview: suspended.filter((c) => c.reps > 0).map((c) => c.id),
    toNew: suspended.filter((c) => c.reps === 0).map((c) => c.id),
  };
}
