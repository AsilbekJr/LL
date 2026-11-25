import { NextResponse } from "next/server";
import { aiModels } from "@/lib/ai/config";
import { GeminiError, geminiJsonFallback } from "@/lib/ai/gemini";
import { guardAiRoute, rateLimiter } from "@/lib/ai/route-helpers";
import {
  STORY_JSON_SCHEMA,
  STORY_SYSTEM,
  storyReplySchema,
  storyRequestSchema,
  storyUserMessage,
  weekday,
} from "@/lib/story/story";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/weekly-story {weekStart, level, words} — write the week's story
 * and save it. One story per week and level: an existing one is returned.
 */
export const runtime = "nodejs";
export const maxDuration = 45;

const limited = rateLimiter(6, 60_000);

export async function POST(request: Request) {
  const blocked = await guardAiRoute(limited);
  if (blocked) return blocked;
  const parsed = storyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || weekday(parsed.data.weekStart) !== 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const req = parsed.data;
  const sb = await getSupabaseServerClient();

  const existing = await sb
    .from("weekly_stories")
    .select("*")
    .eq("week_start", req.weekStart)
    .eq("level", req.level)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ error: "db" }, { status: 500 });
  if (existing.data) return NextResponse.json(existing.data);

  try {
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: STORY_SYSTEM,
      user: storyUserMessage(req),
      schema: STORY_JSON_SCHEMA,
      maxOutputTokens: 4096,
      signal: AbortSignal.timeout(40_000),
      attemptTimeoutMs: 22_000,
    });
    const reply = storyReplySchema.safeParse(JSON.parse(raw));
    if (!reply.success) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    const { title, ...story } = reply.data;
    const { data, error } = await sb
      .from("weekly_stories")
      .upsert(
        { week_start: req.weekStart, level: req.level, title, story, words: req.words },
        { onConflict: "user_id,week_start,level", ignoreDuplicates: false },
      )
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "db" }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof GeminiError) {
      const status = e.kind === "rate_limited" ? 429 : e.kind === "misconfigured" ? 503 : 502;
      return NextResponse.json({ error: e.kind }, { status });
    }
    if (e instanceof SyntaxError) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    if (e instanceof Error && e.name === "TimeoutError") {
      return NextResponse.json({ error: "upstream" }, { status: 504 });
    }
    throw e;
  }
}
