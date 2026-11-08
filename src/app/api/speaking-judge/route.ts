import { NextResponse } from "next/server";
import { geminiRoute, guardAiRoute, rateLimiter } from "@/lib/ai/route-helpers";
import {
  JUDGE_JSON_SCHEMA,
  JUDGE_SYSTEM,
  judgeRequestSchema,
  judgeSchema,
  judgeUserMessage,
} from "@/lib/speaking/judge";

/**
 * POST /api/speaking-judge — strict AI check of one spoken answer
 * (grammar, meaning, the word, the task, fluency). Signed-in, rate limited.
 */
export const runtime = "nodejs";

const limited = rateLimiter(40, 60_000);

export async function POST(request: Request) {
  const blocked = await guardAiRoute(limited);
  if (blocked) return blocked;
  const parsed = judgeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return geminiRoute({
    name: "Speaking judge",
    system: JUDGE_SYSTEM,
    user: judgeUserMessage(parsed.data),
    schema: JUDGE_JSON_SCHEMA,
    parse: (v) => judgeSchema.safeParse(v),
    timeoutMs: 12_000,
  });
}
