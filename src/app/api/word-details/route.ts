import { NextResponse } from "next/server";
import { aiFeedbackEnabled, aiModels, aiProvider } from "@/lib/ai/config";
import { GeminiError, geminiJsonFallback } from "@/lib/ai/gemini";
import {
  WORD_DETAILS_JSON_SCHEMA,
  WORD_DETAILS_SYSTEM,
  wordDetailsRequestSchema,
  wordDetailsResponseSchema,
  wordDetailsUserMessage,
} from "@/lib/items/word-details";
import { getCurrentUserId } from "@/lib/supabase/server";

/**
 * POST /api/word-details — example sentence (EN + UZ), part of speech and a
 * short Uzbek note for up to 20 words at once (Gemini). Signed-in users only,
 * rate limited. The client treats it as best effort.
 */
export const runtime = "nodejs";

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  if (!aiFeedbackEnabled() || aiProvider() !== "gemini") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(userId)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = wordDetailsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const user = wordDetailsUserMessage(parsed.data.words);

  try {
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: WORD_DETAILS_SYSTEM,
      user,
      schema: WORD_DETAILS_JSON_SCHEMA,
      maxOutputTokens: 4096,
      signal: AbortSignal.timeout(25_000),
    });
    const out = wordDetailsResponseSchema.safeParse(JSON.parse(raw));
    if (!out.success) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    return NextResponse.json(out.data);
  } catch (error) {
    if (error instanceof GeminiError) {
      const status = { rate_limited: 429, misconfigured: 503, refused: 422, truncated: 502, upstream: 502 }[
        error.kind
      ];
      if (error.kind === "misconfigured" || error.kind === "upstream") {
        console.error(`Word details: ${error.message}`);
      }
      return NextResponse.json({ error: error.kind }, { status });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "upstream" }, { status: 504 });
    }
    throw error;
  }
}
