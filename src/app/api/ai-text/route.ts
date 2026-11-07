import { NextResponse } from "next/server";
import { aiFeedbackEnabled, aiModel, aiProvider } from "@/lib/ai/config";
import { GeminiError, geminiJson } from "@/lib/ai/gemini";
import {
  AI_TEXT_JSON_SCHEMA,
  AI_TEXT_SYSTEM,
  aiTextRequestSchema,
  aiTextSchema,
  TEXT_LENGTH,
} from "@/lib/reading/ai-text";
import { getCurrentUserId } from "@/lib/supabase/server";

/**
 * POST /api/ai-text — a short graded text at the learner's level that uses
 * their own words (Gemini). Server-only key; signed-in users; rate limited.
 */
export const runtime = "nodejs";

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 10;
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

  const parsed = aiTextRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = parsed.data;

  const user = [
    `CEFR level: ${r.level} (${TEXT_LENGTH[r.level]})`,
    `Topic: ${r.topic?.trim() || "anything from everyday life that fits the words"}`,
    "<target_words>",
    ...r.words.map((w) => `- ${w}`),
    "</target_words>",
  ].join("\n");

  try {
    const raw = await geminiJson({
      model: aiModel("gemini"),
      system: AI_TEXT_SYSTEM,
      user,
      schema: AI_TEXT_JSON_SCHEMA,
      maxOutputTokens: 4096,
      signal: AbortSignal.timeout(30_000),
    });
    const text = aiTextSchema.safeParse(JSON.parse(raw));
    if (!text.success) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    return NextResponse.json({ text: text.data });
  } catch (error) {
    if (error instanceof GeminiError) {
      const status = { rate_limited: 429, misconfigured: 503, refused: 422, truncated: 502, upstream: 502 }[
        error.kind
      ];
      if (error.kind === "misconfigured" || error.kind === "upstream")
        console.error(`AI text: ${error.message}`);
      return NextResponse.json({ error: error.kind }, { status });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "upstream" }, { status: 504 });
    }
    throw error;
  }
}
