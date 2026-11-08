"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RotateCcw, SkipForward, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form-controls";
import { fetchCorrections, FIX_CONTEXT, type ProductionWrite } from "@/lib/production/api";
import { fixPassed } from "@/lib/speaking/repeat";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { SpokenAnswerInput, useSpokenAnswer } from "./speaking-shared";

/**
 * "Xatolar": every sentence that failed in a speaking drill comes back here
 * in its corrected form. Listen, say it in one go; once said right it leaves
 * the list (saved as a repeat, which does not count as free production).
 */
export function FixPractice({
  speech,
  onSave,
}: {
  speech: SpeechPrefs;
  onSave: (rows: ProductionWrite[]) => void;
}) {
  const t = uz.speaking;
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["speaking-corrections"],
    queryFn: () => fetchCorrections(getSupabaseBrowserClient()),
  });
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const answer = useSpokenAnswer();

  if (list.isPending) return <div className="h-48 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />;
  if (list.isError) {
    return (
      <Notice tone="danger" icon={AlertTriangle}>
        {uz.common.errorBody}{" "}
        <button type="button" className="underline" onClick={() => list.refetch()}>
          {uz.common.retry}
        </button>
      </Notice>
    );
  }

  const queue = list.data.filter((c) => !done.has(c.client_id) && !skipped.has(c.client_id));
  const current = queue[0];
  if (!current) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t.fixIntro}</p>
        <EmptyState icon={Sparkles} title={t.fixEmpty} description="" />
      </div>
    );
  }

  const target = current.corrected_text ?? "";
  const result = answer.answer ? fixPassed(answer.answer, target) : null;

  function next(save: boolean) {
    if (save && current && answer.answer && result?.passed) {
      onSave([
        {
          clientId: crypto.randomUUID(),
          itemId: current.item_id,
          mode: "spoken",
          exercise: "shadowing",
          context: `${FIX_CONTEXT}${current.client_id}`,
          prompt: target,
          text: answer.answer,
          passed: true,
          durationMs: answer.rec.durationMs || null,
        },
      ]);
      setDone((d) => new Set(d).add(current.client_id));
      if (queue.length === 1) void qc.invalidateQueries({ queryKey: ["speaking-corrections"] });
    } else if (current) {
      setSkipped((s) => new Set(s).add(current.client_id));
    }
    answer.reset();
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.fixIntro}</p>
      <p className="text-xs font-semibold text-muted-foreground">{t.fixLeft(queue.length)}</p>

      <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        {current.items ? (
          <p className="text-xs font-semibold text-muted-foreground">
            <span lang="en">{current.items.english}</span> — {current.items.uzbek}
          </p>
        ) : null}
        <p className="mt-3 text-xs font-semibold text-muted-foreground">{t.fixWas}</p>
        <p className="mt-0.5 text-muted-foreground line-through decoration-destructive/60" lang="en">
          {current.text}
        </p>
        <p className="mt-3 text-xs font-semibold text-muted-foreground">{t.fixSay}</p>
        <p className="mt-0.5 font-display text-2xl leading-snug font-semibold" lang="en">
          {target}
        </p>
        <div className="mt-3">
          <SpeakButton text={target} prefs={speech} />
        </div>
      </section>

      {!answer.answer ? <SpokenAnswerInput state={answer} /> : null}

      {result && answer.answer ? (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3",
            result.passed
              ? "border-success/30 bg-success-soft text-success"
              : "border-warning/30 bg-warning-soft text-warning",
          )}
        >
          <p className="flex items-center gap-2 font-semibold">
            {result.passed ? <CheckCircle2 className="size-4" aria-hidden /> : null}
            {result.passed ? t.fixPassed : t.fixRetry(Math.round(result.similarity * 100))}
          </p>
          <p className="mt-1 text-sm text-foreground" lang="en">
            <span className="text-muted-foreground">{uz.production.transcript}</span> {answer.answer}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {result && !result.passed ? (
          <Button variant="outline" onClick={() => answer.reset()}>
            <RotateCcw aria-hidden />
            {uz.production.redo}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => next(false)}>
            <SkipForward aria-hidden />
            {t.fixSkip}
          </Button>
        )}
        <Button onClick={() => next(true)} disabled={!result?.passed} autoFocus={Boolean(result?.passed)}>
          {t.fixNext}
        </Button>
      </div>
    </div>
  );
}
