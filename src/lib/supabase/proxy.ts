import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

const PUBLIC_PATHS = [
  "/login",
  "/~offline",
  "/manifest.webmanifest",
  "/samples",
  "/robots.txt",
  "/api/health",
];

/** Never let a slow Supabase hang every page: after this the session counts as "unknown". */
const AUTH_TIMEOUT_MS = 4000;

type AuthState = "signed-in" | "signed-out" | "unknown";

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookie on every request and guards
 * the app: unauthenticated users go to /login, signed-in users skip it.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Do not put code between client creation and getClaims(): it refreshes the token.
  const state = await readAuthState(() => supabase.auth.getClaims());
  const { pathname } = request.nextUrl;

  // Supabase unreachable / timed out: do NOT sign the user out. Let the
  // request through; pages and API routes check the session themselves and
  // show a retryable error instead of a surprise login screen.
  if (state === "unknown") return response;
  const signedIn = state === "signed-in";

  if (!signedIn && !isPublic(pathname)) {
    // API callers get a JSON 401, not an HTML login page.
    if (pathname.startsWith("/api/")) {
      return copyCookies(response, NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return copyCookies(response, NextResponse.redirect(url));
  }

  if (signedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/bugun";
    url.search = "";
    return copyCookies(response, NextResponse.redirect(url));
  }

  return response;
}

async function readAuthState(
  getClaims: () => Promise<{ data: { claims?: { sub?: string } } | null; error: unknown }>,
): Promise<AuthState> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), AUTH_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([getClaims(), timeout]);
    if (result === "timeout") return "unknown";
    if (result.data?.claims?.sub) return "signed-in";
    if (result.error && isTransientAuthError(result.error)) return "unknown";
    return "signed-out";
  } catch (error) {
    // A thrown fetch failure is a network problem, not a missing session.
    return isTransientAuthError(error) || error instanceof TypeError ? "unknown" : "signed-out";
  } finally {
    clearTimeout(timer);
  }
}

/** Network failures and Supabase 5xx are temporary; 4xx means "no valid session". */
function isTransientAuthError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" && (status === 0 || status >= 500);
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}
