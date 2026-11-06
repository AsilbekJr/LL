import { z } from "zod";

/**
 * Public env vars are inlined at build time, so they must be referenced
 * explicitly (not via a dynamic process.env[key] lookup).
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_TIMEZONE: z.string().default("Asia/Tashkent"),
});

const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_TIMEZONE: process.env.NEXT_PUBLIC_TIMEZONE,
});

if (!parsed.success) {
  throw new Error(
    `Env xato: .env.local faylini tekshiring (.env.example ga qarang).\n${z.prettifyError(parsed.error)}`,
  );
}

export const env = parsed.data;
export const APP_TIMEZONE = env.NEXT_PUBLIC_TIMEZONE;
