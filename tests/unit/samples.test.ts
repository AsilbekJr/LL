import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dedupeItems } from "@/lib/items/dedupe";
import { parsePack, sampleIndexSchema } from "@/lib/schemas/pack";

const dir = join(process.cwd(), "public", "samples");
const read = (f: string) => readFileSync(join(dir, f), "utf-8");

describe("shipped sample packs", () => {
  const index = sampleIndexSchema.parse(JSON.parse(read("index.json")));

  it("index lists A1–C2", () => {
    expect(index.map((p) => p.cefr_level)).toEqual(["A1", "A2", "B1", "B2", "C1", "C2"]);
  });

  it.each(index.map((p) => [p.file, p] as const))(
    "%s parses without errors and matches the index",
    (file, entry) => {
      const r = parsePack(read(file));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.pack.errors).toEqual([]);
      expect(r.pack.items).toHaveLength(entry.count);
      expect(r.pack.cefr_level).toBe(entry.cefr_level);
      expect(dedupeItems(r.pack.items, new Set()).repeated).toEqual([]);
    },
  );

  it("template.json is a valid pack", () => {
    const r = parsePack(read("template.json"));
    expect(r.ok && r.pack.errors.length === 0).toBe(true);
  });

  it("no English entry appears in two packs", () => {
    const all = index.flatMap((p) => {
      const r = parsePack(read(p.file));
      return r.ok ? r.pack.items : [];
    });
    expect(dedupeItems(all, new Set()).repeated.map((i) => i.english)).toEqual([]);
  });
});
