import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | undefined;

/** Singleton browser client (safe to call from any client component). */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  browserClient ??= createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return browserClient;
}
