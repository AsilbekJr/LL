import { describe, expect, it } from "vitest";
import { draftColumns } from "@/lib/items/api";
import { parsePasteList } from "@/lib/items/paste";

describe("items: only real columns are sent to the database", () => {
  it("drops UI-only fields such as the pasted-list line number", () => {
    const { items } = parsePasteList("apple - olma\ngive up - taslim bo'lmoq", { cefr_level: null, tags: [] });
    expect(items[0]).toMatchObject({ line: 1 });
    const row = draftColumns(items[0]!);
    expect(Object.keys(row).sort()).toEqual(
      ["cefr_level", "english", "example_en", "example_uz", "notes", "part_of_speech", "tags", "type", "uzbek"].sort(),
    );
    expect(row).toMatchObject({ english: "apple", uzbek: "olma" });
  });
});
