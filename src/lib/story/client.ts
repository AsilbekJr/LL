import type { StoryRow } from "./api";
import { retellSchema, type Retell, type RetellRequest, type StoryRequest } from "./story";

export class StoryError extends Error {
  constructor(readonly status: number) {
    super(`story ${status}`);
  }
}

/** Write (or fetch the already written) story of a week. Throws StoryError so the UI can retry. */
export async function generateStory(req: StoryRequest): Promise<StoryRow> {
  const res = await fetch("/api/weekly-story", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new StoryError(res.status);
  return (await res.json()) as StoryRow;
}

/** AI check of a retelling. null = AI off or unreachable (the offline score is used). */
export async function fetchRetell(req: RetellRequest): Promise<Retell | null> {
  try {
    const res = await fetch("/api/story-retell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(35_000),
    });
    if (!res.ok) return null;
    const out = retellSchema.safeParse(await res.json());
    return out.success ? out.data : null;
  } catch {
    return null;
  }
}
