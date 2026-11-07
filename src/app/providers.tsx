"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { reloadForStaleBuild } from "@/lib/app/stale-build";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 24 * 60 * 60 * 1000,
            refetchOnWindowFocus: true,
            retry: (count, error) => count < 2 && !(error instanceof TypeError && !navigator.onLine),
          },
          mutations: { networkMode: "offlineFirst" },
        },
      }),
  );

  // A stale chunk can also fail outside React rendering (a lazy import in a
  // click handler); the error boundaries never see those.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => void reloadForStaleBuild(e.reason);
    const onError = (e: ErrorEvent) => void reloadForStaleBuild(e.error);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
