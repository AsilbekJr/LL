import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { aiFeedbackEnabled } from "@/lib/ai/config";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Health check, public (no user data, no secrets).
 *  - Vercel Cron calls it every day (vercel.json). The real database query
 *    counts as project activity, so the free Supabase project is never
 *    paused for inactivity (it pauses after 7 quiet days).
 *  - Open it by hand (/api/health) to see at a glance what is down.
 * Status 200 = everything reachable, 503 = something failed.
 */
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 8000;

type Check = { ok: boolean; ms: number; error?: string };

async function timed(run: (signal: AbortSignal) => Promise<void>): Promise<Check> {
  const start = Date.now();
  try {
    await run(AbortSignal.timeout(TIMEOUT_MS));
    return { ok: true, ms: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  const sb = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [database, auth] = await Promise.all([
    timed(async (signal) => {
      const { data, error } = await sb.rpc("today_tz", { tz: "Asia/Tashkent" }).abortSignal(signal);
      if (error) throw new Error(error.message);
      if (typeof data !== "string") throw new Error("unexpected response");
    }),
    timed(async (signal) => {
      const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
        cache: "no-store",
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }),
  ]);

  const ok = database.ok && auth.ok;
  return Response.json(
    {
      ok,
      checks: { database, auth },
      ai: aiFeedbackEnabled() ? "configured" : "off",
      deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      at: new Date().toISOString(),
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
