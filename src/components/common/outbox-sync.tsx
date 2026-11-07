"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, Loader2 } from "lucide-react";
import { flushOutbox, onOutboxChange, pendingCount } from "@/lib/offline/outbox";
import { prefetchOfflineSession } from "@/lib/offline/session-cache";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

/**
 * Sends answers queued while offline: on app start, when the connection
 * returns, when the tab becomes visible again, and every minute while
 * something is still waiting (a temporary server error must not leave
 * answers stuck until the next reload). Afterwards it keeps a
 * snapshot of today's review session in IndexedDB so reviews can start
 * without internet. Shows a small badge while anything is waiting.
 */
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const RETRY_MS = 60_000;

export function OutboxSync() {
  const [pending, setPending] = useState(0);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  useEffect(() => {
    const sb = getSupabaseBrowserClient();
    // Send waiting answers first, then refresh today's offline session snapshot.
    const flush = () => {
      if (!navigator.onLine) return;
      void flushOutbox(sb)
        .then((ok) => (ok ? prefetchOfflineSession(sb) : undefined))
        .catch(() => undefined);
    };
    const onVisible = () => document.visibilityState === "visible" && flush();

    const off = onOutboxChange(setPending);
    void pendingCount().then(setPending);
    flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    const retry = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void pendingCount().then((n) => n > 0 && flush());
    }, RETRY_MS);
    return () => {
      off();
      window.clearInterval(retry);
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!pending && online) return null;
  return (
    <div
      role="status"
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-semibold shadow-(--shadow-lift)"
    >
      {online ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <CloudOff className="size-3.5" aria-hidden />
      )}
      {online ? uz.offline.syncing(pending) : pending ? uz.offline.waiting(pending) : uz.offline.offline}
    </div>
  );
}
