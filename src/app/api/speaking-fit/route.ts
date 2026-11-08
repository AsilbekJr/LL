import { NextResponse } from "next/server";
import { geminiRoute, guardAiRoute, rateLimiter } from "@/lib/ai/route-helpers";
import {
  FIT_JSON_SCHEMA,
  FIT_SYSTEM,
  fitRequestSchema,
  fitsFromChecks,
  fitUserMessage,
} from "@/lib/speaking/fit";

/** POST /api/speaking-fit — which pattern frames a word fits with a sensible sentence. */
export const runtime = "nodejs";

const limited = rateLimiter(30, 60_000);

export async function POST(request: Request) {
  const blocked = await guardAiRoute(limited);
  if (blocked) return blocked;
  const parsed = fitRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const ids = new Set(parsed.data.patterns.map((p) => p.id));
  return geminiRoute({
    name: "Speaking fit",
    system: FIT_SYSTEM,
    user: fitUserMessage(parsed.data),
    schema: FIT_JSON_SCHEMA,
    // Keep only frames that were asked about (the model must not invent ids).
    parse: (v) => {
      const out = fitsFromChecks(v, ids);
      return out ? { success: true, data: out } : { success: false };
    },
    timeoutMs: 12_000,
  });
}
