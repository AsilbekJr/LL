"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, Loader2 } from "lucide-react";
import { flushOutbox, onOutboxChange, pendingCount } from "@/lib/offline/outbox";
import { prefetchOfflineSession } from "@/lib/offline/session-cache";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

/**
 * Sends answers queued while offline: on app start, when the connection
 * returns, and when the tab becomes visible again. Afterwards it keeps a
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
    return () => {
      off();
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
