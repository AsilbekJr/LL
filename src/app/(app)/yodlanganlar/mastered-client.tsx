"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, GraduationCap, Mic, PenLine, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { fetchMastered } from "@/lib/production/api";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

export function MasteredClient() {
  const t = uz.mastered;
  const q = useQuery({ queryKey: ["mastered"], queryFn: () => fetchMastered(getSupabaseBrowserClient()) });
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLowerCase());

  const items = useMemo(
    () =>
      (q.data ?? []).filter(
        (i) =>
          !deferred ||
          `${i.english} ${i.uzbek} ${i.productions.map((p) => p.text).join(" ")}`
            .toLowerCase()
            .includes(deferred),
      ),
    [q.data, deferred],
  );

  if (q.isPending) return <div className="h-64 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />;
  if (q.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={uz.common.errorTitle}
        description={uz.common.errorBody}
        action={<Button onClick={() => q.refetch()}>{uz.common.retry}</Button>}
      />
    );
  }
  if (q.data.length === 0)
    return <EmptyState icon={GraduationCap} title={t.emptyTitle} description={t.emptyBody} />;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t.description(q.data.length)}</p>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
          className="pl-10"
        />
      </div>

      {items.length === 0 ? (
        <EmptyState icon={SearchX} title={uz.library.noResults} description={uz.library.noResultsBody} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const own = item.productions.filter((p) => p.passed && p.exercise !== "shadowing").slice(0, 4);
            return (
              <li key={item.id} className="rounded-2xl border bg-card p-4 shadow-(--shadow-soft)">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-xl font-semibold" lang="en">
                      {item.english}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.uzbek}</p>
                  </div>
                  {item.cefr_level ? <Badge tone="success">{item.cefr_level}</Badge> : null}
                </div>
                <div className="mt-3 border-t border-dashed pt-3">
                  <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                    {t.yourSentences}
                  </p>
                  {own.length ? (
                    <ul className="flex flex-col gap-2">
                      {own.map((p) => (
                        <li key={p.id} className="flex items-start gap-2 text-sm">
                          {p.mode === "spoken" ? (
                            <Mic
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-label={t.spoken}
                            />
                          ) : (
                            <PenLine
                              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                              aria-label={t.written}
                            />
                          )}
                          <span lang="en">{p.text}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noSentences}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
