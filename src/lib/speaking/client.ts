import { judgeSchema, type Judge, type JudgeRequest } from "./judge";
import { dialogTurnSchema, type DialogRequest, type DialogTurn } from "./dialog";

/** Strict AI check of one spoken answer. null = AI off or unreachable (fall back to the offline check). */
export async function fetchJudge(req: JudgeRequest, signal?: AbortSignal): Promise<Judge | null> {
  try {
    const res = await fetch("/api/speaking-judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: signal ?? AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const out = judgeSchema.safeParse(await res.json());
    return out.success ? out.data : null;
  } catch {
    return null;
  }
}

export class DialogError extends Error {
  constructor(readonly status: number) {
    super(`dialog ${status}`);
  }
}

/** The coach's next question. Throws DialogError so the UI can offer a retry. */
export async function fetchDialogTurn(req: DialogRequest): Promise<DialogTurn> {
  const res = await fetch("/api/speaking-dialog", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new DialogError(res.status);
  const out = dialogTurnSchema.safeParse(await res.json());
  if (!out.success) throw new DialogError(502);
  return out.data;
}
