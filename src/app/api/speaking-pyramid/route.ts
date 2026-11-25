import { NextResponse } from "next/server";
import { geminiRoute, guardAiRoute, rateLimiter } from "@/lib/ai/route-helpers";
import {
  BUILDER_JSON_SCHEMA,
  BUILDER_SYSTEM,
  builderRequestSchema,
  builderSchema,
  builderUserMessage,
} from "@/lib/speaking/pyramid";

/** POST /api/speaking-pyramid — a situation + pieces for the first pyramid sentence. */
export const runtime = "nodejs";

const limited = rateLimiter(30, 60_000);

export async function POST(request: Request) {
  const blocked = await guardAiRoute(limited);
  if (blocked) return blocked;
  const parsed = builderRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return geminiRoute({
    name: "Speaking pyramid builder",
    system: BUILDER_SYSTEM,
    user: builderUserMessage(parsed.data),
    schema: BUILDER_JSON_SCHEMA,
    parse: (v) => builderSchema.safeParse(v),
    timeoutMs: 12_000,
  });
}
