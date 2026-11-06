import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: `middleware.ts` was renamed to `proxy.ts`.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets, the service worker, icons and sample packs.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/|sw.js|swe-worker-|samples/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|json|webmanifest)$).*)",
  ],
};
