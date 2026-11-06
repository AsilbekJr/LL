import { englishKey } from "@/lib/schemas/item";

export interface DedupeResult<T> {
  /** Items to insert. */
  fresh: T[];
  /** Already in the library. */
  existing: T[];
  /** Repeated inside the input itself (first occurrence is kept in `fresh`/`existing`). */
  repeated: T[];
}

/** Split candidates by the same rule as the DB unique index: lower(trim(english)). */
export function dedupeItems<T extends { english: string }>(
  candidates: T[],
  existingKeys: ReadonlySet<string>,
): DedupeResult<T> {
  const seen = new Set<string>();
  const out: DedupeResult<T> = { fresh: [], existing: [], repeated: [] };
  for (const c of candidates) {
    const key = englishKey(c.english);
    if (seen.has(key)) out.repeated.push(c);
    else if (existingKeys.has(key)) out.existing.push(c);
    else out.fresh.push(c);
    seen.add(key);
  }
  return out;
}

/** Split an array into chunks (PostgREST requests stay small). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
