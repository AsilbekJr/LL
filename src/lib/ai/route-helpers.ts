import "server-only";
import { NextResponse } from "next/server";
import { aiFeedbackEnabled, aiModels, aiProvider } from "./config";
import { GeminiError, geminiJsonFallback } from "./gemini";
import { getCurrentUserId } from "@/lib/supabase/server";

/**
 * Shared plumbing for the small Gemini JSON routes: AI switched on, signed in,
 * a per-user rate limit, one structured call, errors mapped to statuses.
 */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (userId: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(userId, recent);
    return recent.length > max;
  };
}

export async function guardAiRoute(limited: (userId: string) => boolean): Promise<NextResponse | null> {
  if (!aiFeedbackEnabled() || aiProvider() !== "gemini") {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(userId)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  return null;
}

export async function geminiRoute<T>(opts: {
  name: string;
  system: string;
  user: string;
  schema: unknown;
  parse: (value: unknown) => { success: true; data: T } | { success: false };
  timeoutMs?: number;
  maxOutputTokens?: number;
}): Promise<NextResponse> {
  try {
    const raw = await geminiJsonFallback(aiModels("gemini"), {
      system: opts.system,
      user: opts.user,
      schema: opts.schema,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    const out = opts.parse(JSON.parse(raw));
    if (!out.success) return NextResponse.json({ error: "bad_output" }, { status: 502 });
    return NextResponse.json(out.data);
  } catch (error) {
    if (error instanceof GeminiError) {
      const status = { rate_limited: 429, misconfigured: 503, refused: 422, truncated: 502, upstream: 502 }[
        error.kind
      ];
      if (error.kind === "misconfigured" || error.kind === "upstream") {
        console.error(`${opts.name}: ${error.message}`);
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
