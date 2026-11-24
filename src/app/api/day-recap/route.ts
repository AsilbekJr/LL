import { NextResponse } from "next/server";
import { geminiRoute, guardAiRoute, rateLimiter } from "@/lib/ai/route-helpers";
import {
  RECAP_JSON_SCHEMA,
  RECAP_SYSTEM,
  recapRequestSchema,
  recapSchema,
  recapUserMessage,
} from "@/lib/speaking/recap";

/**
 * POST /api/day-recap — "Kun yakuni": check a free 1–2 minute talk. Confirms
 * which library words were used correctly, picks the one most useful fix and
 * suggests one phrase. Signed-in, rate limited.
 */
export const runtime = "nodejs";

const limited = rateLimiter(10, 60_000);

export async function POST(request: Request) {
  const blocked = await guardAiRoute(limited);
  if (blocked) return blocked;
  const parsed = recapRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return geminiRoute({
    name: "Day recap",
    system: RECAP_SYSTEM,
    user: recapUserMessage(parsed.data),
    schema: RECAP_JSON_SCHEMA,
    parse: (v) => recapSchema.safeParse(v),
    timeoutMs: 20_000,
    maxOutputTokens: 2048,
  });
}
