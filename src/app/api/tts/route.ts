import { NextResponse } from "next/server";
import { z } from "zod";
import { GeminiError, geminiSpeech } from "@/lib/ai/gemini";
import { wavToMp3 } from "@/lib/ai/mp3";
import { normalizeSpeechText, TTS_BUCKET, TTS_VOICE, ttsObjectPath } from "@/lib/speech/tts-key";
import { getCurrentUserId, getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/tts — English speech for phones whose own speech engine fails.
 * Generated once with Gemini TTS (falling back to a second model when the
 * first is rate limited), compressed to MP3 and stored in the public "tts"
 * bucket, so the next request for the same phrase is served by the CDN.
 * The text travels in the body, never in a URL. Signed-in users only.
 */
export const runtime = "nodejs";

const bodySchema = z.object({ text: z.string().trim().min(1).max(400) });

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 150;
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > MAX_PER_WINDOW;
}

function models(): string[] {
  const list = process.env.TTS_MODELS?.split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return list?.length ? list : ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"];
}

/** Try each model in turn; a rate limit or upstream error moves on to the next. */
async function synthesize(text: string): Promise<Uint8Array> {
  let last: unknown = null;
  for (const model of models()) {
    try {
      const { audio } = await geminiSpeech({
        model,
        voice: TTS_VOICE,
        text,
        signal: AbortSignal.timeout(15_000),
      });
      return new Uint8Array(audio);
    } catch (error) {
      last = error;
      const retryable =
        (error instanceof GeminiError && (error.kind === "rate_limited" || error.kind === "upstream")) ||
        (error instanceof Error && error.name === "TimeoutError");
      if (!retryable) break;
    }
  }
  throw last;
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY?.trim()) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (rateLimited(userId)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const text = normalizeSpeechText(parsed.data.text);

  let mp3: Uint8Array;
  try {
    const wav = await synthesize(text);
    mp3 = wavToMp3(wav);
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
    console.error("TTS:", error);
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }

  // Share it: store once (first writer wins). A failed upload only costs a regeneration later.
  try {
    const supabase = await getSupabaseServerClient();
    await supabase.storage.from(TTS_BUCKET).upload(await ttsObjectPath(text), mp3, {
      contentType: "audio/mpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  } catch {
    // ignore
  }

  return new Response(mp3.buffer as ArrayBuffer, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" },
  });
}
