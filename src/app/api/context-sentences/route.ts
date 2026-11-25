import { NextResponse } from "next/server";
import { aiModels } from "@/lib/ai/config";
import { GeminiError, geminiJsonFallback } from "@/lib/ai/gemini";
import { guardAiRoute, rateLimiter } from "@/lib/ai/route-helpers";
import {
  cleanGenerated,
  CONTEXT_COUNT,
  CONTEXT_JSON_SCHEMA,
  CONTEXT_SYSTEM,
  contextReplySchema,
  contextRequestSchema,
  contextSentences,
  contextUserMessage,
} from "@/lib/items/context-sentences";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/context-sentences {itemId} — write the word's context sentences
 * (5 situations) and save them on the item. Idempotent: an item that already
 * has them is returned as is. RLS keeps it to the learner's own items.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const limited = rateLimiter(40, 60_000);

export async function POST(request: Request) {
  const blocked = await guardAiRoute(limited);
  if (blocked) return blocked;
  const parsed = contextRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const sb = await getSupabaseServerClient();
  const { data: item, error } = await sb
    .from("items")
    .select("id, type, english, uzbek, part_of_speech, cefr_level, context_sentences")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "db" }, { status: 500 });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (item.type === "sentence") return NextResponse.json({ sentences: [] });
  const existing = contextSentences(item.context_sentences);
  if (existing.length >= CONTEXT_COUNT) return NextResponse.json({ sentences: existing });

  try {
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: CONTEXT_SYSTEM,
      user: contextUserMessage(item),
      schema: CONTEXT_JSON_SCHEMA,
      maxOutputTokens: 2048,
      signal: AbortSignal.timeout(25_000),
      attemptTimeoutMs: 14_000,
    });
    const reply = contextReplySchema.safeParse(JSON.parse(raw));
    if (!reply.success) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    const sentences = cleanGenerated(reply.data.sentences, item.english);
    if (sentences.length < 3) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    const { error: saveError } = await sb
      .from("items")
      .update({ context_sentences: sentences })
      .eq("id", item.id);
    if (saveError) return NextResponse.json({ error: "db" }, { status: 500 });
    return NextResponse.json({ sentences });
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
