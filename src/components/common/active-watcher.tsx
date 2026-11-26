"use client";

import { useEffect } from "react";
import { toast } from "sonner";
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
    const t = uz.active;
    toast.success(milestone ? t.milestone(milestone) : t.gained(count - seen), {
      description: t.total(count),
      icon: <Sparkles className="size-5 text-success" aria-hidden />,
    });
  }, [data]);

  return null;
}
