import { NextResponse } from "next/server";
import { geminiRoute, guardAiRoute, rateLimiter } from "@/lib/ai/route-helpers";
import {
  RETELL_JSON_SCHEMA,
  RETELL_SYSTEM,
  retellRequestSchema,
  retellSchema,
  retellUserMessage,
} from "@/lib/story/story";

/** POST /api/story-retell — check a spoken retelling of the weekly story. */
export const runtime = "nodejs";
export const maxDuration = 30;

const limited = rateLimiter(10, 60_000);

export async function POST(request: Request) {
  const blocked = await guardAiRoute(limited);
  if (blocked) return blocked;
  const parsed = retellRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return geminiRoute({
    name: "Story retell",
    system: RETELL_SYSTEM,
    user: retellUserMessage(parsed.data),
    schema: RETELL_JSON_SCHEMA,
    parse: (v) => retellSchema.safeParse(v),
    timeoutMs: 25_000,
    maxOutputTokens: 2048,
  });
}
