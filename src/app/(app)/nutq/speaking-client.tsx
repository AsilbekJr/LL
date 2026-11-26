"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Layers, MessagesSquare, Mic, Wrench } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchPracticeItems, fetchSpokenUses, saveProductions, type ProductionWrite } from "@/lib/production/api";
import { ACTIVE_DAYS, activeCount, spokenDays } from "@/lib/production/active";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { DialogPractice } from "./dialog-practice";
import { FixPractice } from "./fix-practice";
import { PyramidDrill } from "./pyramid-drill";

const sb = () => getSupabaseBrowserClient();

function useSave() {
  return useMutation({ mutationFn: (rows: ProductionWrite[]) => saveProductions(sb(), rows) });
}

export function SpeakingClient({
  ttsRate,
  ttsVoice,
  aiEnabled,
  initialTab,
}: {
  ttsRate: number;
  ttsVoice: string | null;
  aiEnabled: boolean;
  initialTab?: "dialog" | "pyramid" | "fix";
}) {
  const t = uz.speaking;
  const items = useQuery({ queryKey: ["practice-items"], queryFn: () => fetchPracticeItems(sb()) });
  const uses = useQuery({ queryKey: ["spoken-uses"], queryFn: () => fetchSpokenUses(sb()) });
  const progress = useMemo(() => spokenDays(uses.data ?? []), [uses.data]);
  const save = useSave();
  const qc = useQueryClient();
  const speech = useMemo(() => ({ rate: ttsRate, voice: ttsVoice }), [ttsRate, ttsVoice]);
  const onSave = (rows: ProductionWrite[]) => {
    void save
      .mutateAsync(rows)
      .then(() => {
        void uses.refetch();
        void qc.invalidateQueries({ queryKey: ["speaking-corrections"] });
      })
      .catch(() => undefined);
  };

  if (items.isPending) {
    return <div className="h-64 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />;
  }
  if (items.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={uz.common.errorTitle}
        description={uz.common.errorBody}
        action={<Button onClick={() => items.refetch()}>{uz.common.retry}</Button>}
      />
    );
  }
  if (items.data.length === 0) {
    return (
      <EmptyState
        icon={Mic}
        title={t.emptyTitle}
        description={t.emptyBody}
        action={
          <Button asChild>
            <Link href="/bugun">{uz.review.backToday}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ActiveVocabulary active={activeCount(progress)} total={items.data.length} />
      <Tabs defaultValue={initialTab ?? (aiEnabled ? "dialog" : "pyramid")}>
        {/* Three methods, in order: talk, build a sentence, fix mistakes. */}
        <TabsList className="grid w-full grid-cols-3 [&>button]:gap-1.5 [&>button]:px-1">
          <TabsTrigger value="dialog">
            <MessagesSquare aria-hidden />
            {t.dialogTab}
          </TabsTrigger>
          <TabsTrigger value="pyramid">
            <Layers aria-hidden />
            {t.pyramidTab}
          </TabsTrigger>
          <TabsTrigger value="fix">
            <Wrench aria-hidden />
            {t.fixTab}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dialog">
          <DialogPractice
            items={items.data}
            speech={speech}
            progress={progress}
            onSave={onSave}
            aiEnabled={aiEnabled}
          />
        </TabsContent>
        <TabsContent value="pyramid">
          <PyramidDrill
            items={items.data}
            speech={speech}
            progress={progress}
            onSave={onSave}
            aiEnabled={aiEnabled}
          />
        </TabsContent>
        <TabsContent value="fix">
          <FixPractice speech={speech} onSave={onSave} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ActiveVocabulary({ active, total }: { active: number; total: number }) {
  const t = uz.speaking;
  const pct = total ? Math.round((active / total) * 100) : 0;
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-(--shadow-soft)">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{t.activeTitle}</h2>
        <p className="font-display text-xl font-semibold tabular-nums">{t.activeCount(active, total)}</p>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-sunken"
        role="progressbar"
        aria-label={t.activeTitle}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={active}
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t.activeBody(ACTIVE_DAYS)}</p>
    </section>
  );
}
