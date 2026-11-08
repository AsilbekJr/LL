import { NextResponse } from "next/server";
import { geminiRoute, guardAiRoute, rateLimiter } from "@/lib/ai/route-helpers";
import {
  DIALOG_JSON_SCHEMA,
  DIALOG_SYSTEM,
  dialogRequestSchema,
  dialogTurnSchema,
  dialogUserMessage,
} from "@/lib/speaking/dialog";

/** POST /api/speaking-dialog — the coach's next question in a speaking conversation. */
export const runtime = "nodejs";

const limited = rateLimiter(30, 60_000);

export async function POST(request: Request) {
  const blocked = await guardAiRoute(limited);
  if (blocked) return blocked;
  const parsed = dialogRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return geminiRoute({
    name: "Speaking dialog",
    system: DIALOG_SYSTEM,
    user: dialogUserMessage(parsed.data),
    schema: DIALOG_JSON_SCHEMA,
    parse: (v) => dialogTurnSchema.safeParse(v),
    timeoutMs: 12_000,
  });
}
