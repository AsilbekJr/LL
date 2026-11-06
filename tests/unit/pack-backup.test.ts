import { describe, expect, it } from "vitest";
import { backupFileName, backupSchema, planRestore, stripUser } from "@/lib/schemas/backup";
import { englishKey } from "@/lib/schemas/item";
import { parsePack } from "@/lib/schemas/pack";

describe("parsePack", () => {
  it("parses a full pack and inherits the pack level", () => {
    const r = parsePack(
      JSON.stringify({
        format: "ll-pack",
        version: 1,
        name: "Travel",
        cefr_level: "A2",
        items: [
          { english: "ticket", uzbek: "chipta" },
          { english: "luggage", uzbek: "yuk", cefr_level: "B1" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.name).toBe("Travel");
    expect(r.pack.items.map((i) => i.cefr_level)).toEqual(["A2", "B1"]);
    expect(r.pack.errors).toEqual([]);
  });

  it("accepts a bare array and reports bad items without failing", () => {
    const r = parsePack(
      JSON.stringify([{ english: "a", uzbek: "b" }, { english: "", uzbek: "x" }, 42]),
      "Mening",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.name).toBe("Mening");
    expect(r.pack.items).toHaveLength(1);
    expect(r.pack.errors.map((e) => e.index)).toEqual([1, 2]);
  });

  it("rejects non-JSON and wrong shapes", () => {
    expect(parsePack("not json")).toEqual({ ok: false, error: "Fayl JSON formatida emas" });
    const r = parsePack(JSON.stringify({ name: "x", items: "nope" }));
    expect(r.ok).toBe(false);
  });
});

describe("backup", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const file = {
    format: "ll-backup",
    version: 1,
    exported_at: "2026-11-06T10:00:00Z",
    data: {
      packs: [],
      items: [
        { id: id(1), english: "Apple" },
        { id: id(2), english: "pear" },
      ],
      cards: [
        { id: id(11), item_id: id(1) },
        { id: id(12), item_id: id(2) },
      ],
      review_logs: [
        { id: id(21), card_id: id(11) },
        { id: id(22), card_id: id(12) },
      ],
      productions: [{ id: id(31), item_id: id(2) }],
      settings: null,
    },
  };

  it("validates the file", () => {
    expect(backupSchema.safeParse(file).success).toBe(true);
    expect(backupSchema.safeParse({ ...file, format: "other" }).success).toBe(false);
  });

  it("restores only items that are not in the library, with their dependents", () => {
    const parsed = backupSchema.parse(file);
    const plan = planRestore(parsed.data, new Set(["apple"]), englishKey);
    expect(plan.items.map((i) => i.id)).toEqual([id(2)]);
    expect(plan.cards.map((c) => c.id)).toEqual([id(12)]);
    expect(plan.review_logs.map((l) => l.id)).toEqual([id(22)]);
    expect(plan.productions.map((p) => p.id)).toEqual([id(31)]);
    expect(plan.skippedItems).toBe(1);
  });

  it("strips user ids and names the file by date", () => {
    expect(stripUser([{ id: "a", user_id: "u", x: 1 }])).toEqual([{ id: "a", x: 1 }]);
    expect(backupFileName(new Date("2026-11-06T10:00:00Z"))).toBe("ll-zaxira-2026-11-06.json");
  });
});
