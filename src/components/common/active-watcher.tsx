"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { activeCount, crossedMilestone, spokenDays } from "@/lib/production/active";
import { fetchSpokenUses } from "@/lib/production/api";
import { celebrate, feedback } from "@/lib/feedback/feedback";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

const SEEN_KEY = "ll.active.seen";

function readSeen(): number | null {
  try {
    const v = window.localStorage.getItem(SEEN_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function writeSeen(n: number) {
  try {
    window.localStorage.setItem(SEEN_KEY, String(n));
  } catch {
    // storage off: no celebration memory
  }
}

interface Toast {
  count: number;
  gained: number;
  milestone: number | null;
}

/**
 * Celebrates the moment a word becomes ACTIVE (and the milestones on the way
 * to 500), wherever that happened — a conversation, the daily talk, the weekly
 * story. Watches the shared "spoken uses" data; the first count seen on a
 * device is only remembered, never celebrated.
 */
export function ActiveWatcher() {
  const uses = useQuery({
    queryKey: ["spoken-uses"],
    queryFn: () => fetchSpokenUses(getSupabaseBrowserClient()),
    staleTime: 5 * 60_000,
  });
  const [toast, setToast] = useState<Toast | null>(null);
  const data = uses.data;

  useEffect(() => {
    if (!data) return;
    const count = activeCount(spokenDays(data));
    const seen = readSeen();
    writeSeen(count);
    if (seen === null || count <= seen) return;
    const milestone = crossedMilestone(seen, count);
    feedback("complete");
    void celebrate(milestone ? "big" : "small");
    // Shown from an effect on purpose: it reacts to new data from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToast({ count, gained: count - seen, milestone });
  }, [data]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  const t = uz.active;
  return (
    <div
      role="status"
      className="animate-pop fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-2xl border border-success/30 bg-card px-4 py-3 shadow-(--shadow-lift)"
      onClick={() => setToast(null)}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">
          {toast.milestone ? t.milestone(toast.milestone) : t.gained(toast.gained)}
        </span>
        <span className="block text-sm text-muted-foreground">{t.total(toast.count)}</span>
      </span>
    </div>
  );
}
