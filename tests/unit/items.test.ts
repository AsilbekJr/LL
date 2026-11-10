import { describe, expect, it } from "vitest";
import { chunk, dedupeItems } from "@/lib/items/dedupe";
import {
  collectTags,
  filterLibrary,
  isHardItem,
  isItemOverdue,
  itemStatus,
  resumePlan,
  type LibraryItem,
} from "@/lib/items/library";
import { parsePasteList, splitLine } from "@/lib/items/paste";
import { englishKey, inferItemType, itemInputSchema, parseTags } from "@/lib/schemas/item";

describe("item schema", () => {
  it("cleans text and infers the type", () => {
    const r = itemInputSchema.parse({ english: "  give   up ", uzbek: " taslim bo'lmoq " });
    expect(r).toMatchObject({
      english: "give up",
      uzbek: "taslim bo'lmoq",
      type: "phrase",
      cefr_level: null,
      tags: [],
    });
    expect(r.notes).toBeNull();
  });

  it("keeps an explicit type and normalizes optional fields", () => {
    const r = itemInputSchema.parse({
      english: "run",
      uzbek: "yugurmoq",
      type: "word",
      cefr_level: "A1",
      example_en: "  ",
      tags: "Sport, sport ,daily",
    });
    expect(r).toMatchObject({ type: "word", cefr_level: "A1", example_en: null, tags: ["sport", "daily"] });
  });

  it("rejects empty or too long text", () => {
    expect(itemInputSchema.safeParse({ english: " ", uzbek: "x" }).success).toBe(false);
    expect(itemInputSchema.safeParse({ english: "x", uzbek: "y".repeat(501) }).success).toBe(false);
    expect(itemInputSchema.safeParse({ english: "x", uzbek: "y", cefr_level: "D1" }).success).toBe(false);
  });

  it("infers types", () => {
    expect(inferItemType("apple")).toBe("word");
    expect(inferItemType("break the ice")).toBe("phrase");
    expect(inferItemType("How are you?")).toBe("sentence");
    expect(inferItemType("I would like to order a coffee")).toBe("sentence");
  });

  it("parses tags", () => {
    expect(parseTags(["A", "a", " b "])).toEqual(["a", "b"]);
    expect(parseTags(null)).toEqual([]);
  });

  it("englishKey mirrors lower(btrim())", () => {
    expect(englishKey("  Apple ")).toBe("apple");
  });
});

describe("parsePasteList", () => {
  it("splits on the supported separators", () => {
    expect(splitLine("apple - olma")).toEqual(["apple", "olma"]);
    expect(splitLine("give up — taslim bo'lmoq")).toEqual(["give up", "taslim bo'lmoq"]);
    expect(splitLine("well-known\tmashhur")).toEqual(["well-known", "mashhur"]);
    expect(splitLine("T-shirt = futbolka")).toEqual(["T-shirt", "futbolka"]);
    expect(splitLine("no separator")).toBeNull();
  });

  it("parses lines, skips blanks and comments, reports bad lines with line numbers", () => {
    const r = parsePasteList("# fruits\napple - olma\n\nbanana\npear -  \n  cherry – gilos  ", {
      cefr_level: "A1",
      tags: ["meva"],
    });
    expect(r.items.map((i) => [i.line, i.english, i.uzbek, i.cefr_level, i.tags])).toEqual([
      [2, "apple", "olma", "A1", ["meva"]],
      [6, "cherry", "gilos", "A1", ["meva"]],
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5]);
  });
});

describe("dedupeItems", () => {
  it("separates fresh, existing and repeated", () => {
    const r = dedupeItems(
      [{ english: "Apple" }, { english: "pear" }, { english: "apple " }, { english: "Kiwi" }],
      new Set(["pear"]),
    );
    expect(r.fresh.map((i) => i.english)).toEqual(["Apple", "Kiwi"]);
    expect(r.existing.map((i) => i.english)).toEqual(["pear"]);
    expect(r.repeated.map((i) => i.english)).toEqual(["apple "]);
  });

  it("chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("library", () => {
  const TODAY = "2026-11-06";
  const card = (status: LibraryItem["cards"][number]["status"], due = TODAY, reps = 0, lapses = 0) => ({
    id: `${status}-${due}-${reps}`,
    direction: "en_uz" as const,
    status,
    due_date: due,
    reps,
    ladder_step: 0,
    lapses,
  });
  const item = (over: Partial<LibraryItem>): LibraryItem => ({
    id: Math.random().toString(36),
    user_id: "u",
    type: "word",
    english: "apple",
    uzbek: "olma",
    cefr_level: "A1",
    part_of_speech: null,
    example_en: null,
    example_uz: null,
    notes: null,
    tags: [],
    source: "manual",
    pack_id: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    cards: [],
    ...over,
  });

  it("derives the item status", () => {
    expect(itemStatus([])).toBe("library");
    expect(itemStatus([card("new"), card("new")])).toBe("new");
    expect(itemStatus([card("new"), card("learning")])).toBe("learning");
    expect(itemStatus([card("mastered"), card("suspended")])).toBe("mastered");
    expect(itemStatus([card("suspended"), card("suspended")])).toBe("suspended");
  });

  it("a hard word is one still being learned that was forgotten 3+ times", () => {
    expect(isHardItem([card("learning", TODAY, 5, 3)])).toBe(true);
    expect(isHardItem([card("review", TODAY, 5, 2), card("review", TODAY, 5, 4)])).toBe(true);
    expect(isHardItem([card("review", TODAY, 5, 2)])).toBe(false);
    // Mastered or paused: no longer a problem to solve.
    expect(isHardItem([card("mastered", TODAY, 9, 5)])).toBe(false);
    expect(isHardItem([card("suspended", TODAY, 9, 5)])).toBe(false);
    const items = [
      item({ english: "easy", cards: [card("review", TODAY, 3, 0)] }),
      item({ english: "stubborn", cards: [card("learning", TODAY, 6, 4)] }),
    ];
    expect(filterLibrary(items, { hardOnly: true }, TODAY).map((i) => i.english)).toEqual(["stubborn"]);
  });

  it("detects overdue items", () => {
    expect(isItemOverdue([card("review", "2026-11-05")], TODAY)).toBe(true);
    expect(isItemOverdue([card("new", "2026-11-01")], TODAY)).toBe(false);
    expect(isItemOverdue([card("review", TODAY)], TODAY)).toBe(false);
  });

  it("filters by text (accent/apostrophe-insensitive), type, level, tag, status, overdue", () => {
    const items = [
      item({ english: "apple", uzbek: "olma", tags: ["meva"], created_at: "2026-11-01T00:00:00Z" }),
      item({
        english: "give up",
        uzbek: "taslim bo‘lmoq",
        type: "phrase",
        cefr_level: "B1",
        created_at: "2026-11-02T00:00:00Z",
      }),
      item({
        english: "café",
        uzbek: "kafe",
        cards: [card("review", "2026-11-03", 2)],
        created_at: "2026-11-03T00:00:00Z",
      }),
    ];
    const names = (f: Parameters<typeof filterLibrary>[1]) =>
      filterLibrary(items, f, TODAY).map((i) => i.english);
    expect(names({ query: "BO'LMOQ" })).toEqual(["give up"]);
    expect(names({ query: "cafe" })).toEqual(["café"]);
    expect(names({ type: "phrase" })).toEqual(["give up"]);
    expect(names({ cefr: "A1" })).toEqual(["café", "apple"]);
    expect(names({ tag: "meva" })).toEqual(["apple"]);
    expect(names({ status: "library" })).toEqual(["give up", "apple"]);
    expect(names({ overdueOnly: true })).toEqual(["café"]);
    expect(filterLibrary(items, {}, TODAY, "az").map((i) => i.english)).toEqual(["apple", "café", "give up"]);
    expect(filterLibrary(items, {}, TODAY, "oldest").map((i) => i.english)).toEqual([
      "apple",
      "give up",
      "café",
    ]);
  });

  it("collects tags by frequency", () => {
    expect(collectTags([{ tags: ["b", "a"] }, { tags: ["a"] }, { tags: [] }])).toEqual(["a", "b"]);
  });

  it("plans un-suspending", () => {
    expect(
      resumePlan([
        { id: "1", status: "suspended", reps: 3 },
        { id: "2", status: "suspended", reps: 0 },
        { id: "3", status: "review", reps: 1 },
      ]),
    ).toEqual({ toReview: ["1"], toNew: ["2"] });
  });
});
