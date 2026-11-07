import { NextResponse } from "next/server";
import { z } from "zod";
import { GeminiError, geminiSpeech } from "@/lib/ai/gemini";
import { getCurrentUserId } from "@/lib/supabase/server";

/**
 * POST /api/tts — English speech from Gemini TTS, for phones whose own speech
 * engine fails ("synthesis-failed"). The text goes in the body (not the URL);
 * the browser caches the audio itself. Signed-in users only, rate limited.
 */
export const runtime = "nodejs";

const bodySchema = z.object({ text: z.string().trim().min(1).max(400) });

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY?.trim()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(userId)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const { audio, mimeType } = await geminiSpeech({
      model: process.env.TTS_MODEL?.trim() || "gemini-3.8-flash-tts",
      voice: process.env.TTS_VOICE?.trim() || "Kore",
      text: parsed.data.text,
      signal: AbortSignal.timeout(20_000),
    });
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": mimeType, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof GeminiError) {
      if (error.kind !== "rate_limited") console.error(`TTS: ${error.message}`);
      const status = { rate_limited: 429, misconfigured: 503, refused: 422, truncated: 502, upstream: 502 }[
        error.kind
      ];
      return NextResponse.json({ error: error.kind }, { status });
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "upstream" }, { status: 504 });
    }
    throw error;
  }
}
