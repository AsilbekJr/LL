"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CloudOff, Info, Loader2, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import {
  ChoiceView,
  ClozeView,
  EncounterView,
  ListeningView,
  OrderView,
  RecallView,
  SpellingView,
} from "@/components/review/exercises";
import type { SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { loadSession, persistAnswer, type AnswerWrite, type LoadedSession } from "@/lib/session/api";
import {
  accuracy,
  answerCard,
  createSession,
  currentCard,
  isFinished,
  previewIntervals,
  remaining,
  type SessionState,
} from "@/lib/session/engine";
import { isProductionPending, planExercise } from "@/lib/session/exercise";
import { canSpeak } from "@/lib/speech/tts";
import type { ReviewResult } from "@/lib/srs/types";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export function SessionClient() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => loadSession(getSupabaseBrowserClient()),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  if (session.isPending) {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <p className="text-muted-foreground" role="status">
          {uz.review.loading}
        </p>
      </Centered>
    );
  }

  if (session.isError) {
    return (
      <Centered>
        <EmptyState
          icon={AlertTriangle}
          title={uz.common.errorTitle}
          description={uz.common.errorBody}
          action={<Button onClick={() => session.refetch()}>{uz.common.retry}</Button>}
          className="w-full"
        />
      </Centered>
    );
  }

  if (session.data.cards.length === 0) {
    return (
      <Centered>
        <EmptyState
          icon={Sparkles}
          title={uz.review.emptyTitle}
          description={uz.review.emptyBody}
          className="w-full"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/bugun">{uz.review.backToday}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/qoshish">
                  <Plus aria-hidden />
                  {uz.review.addWords}
                </Link>
              </Button>
            </div>
          }
        />
      </Centered>
    );
  }

  // A fresh Session (and fresh state) for every load.
  return <Session key={session.dataUpdatedAt} data={session.data} onRestart={() => session.refetch()} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-10">
      {children}
    </main>
  );
}

/** Writes answers in order; failed writes stay queued until retried. */
function useAnswerWriter() {
  const queue = useRef<AnswerWrite[]>([]);
  const busy = useRef(false);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(false);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setFailed(false);
    const sb = getSupabaseBrowserClient();
    try {
      while (queue.current.length) {
        await persistAnswer(sb, queue.current[0]!);
        queue.current.shift();
        setPending(queue.current.length);
      }
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
    }
  }, []);

  const push = useCallback(
    (w: AnswerWrite) => {
      queue.current.push(w);
      setPending(queue.current.length);
      void flush();
    },
    [flush],
  );

  // Warn before closing the tab with unsaved answers.
  useEffect(() => {
    if (!pending) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = uz.review.leaveWarning;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [pending]);

  // Retry automatically when the connection comes back.
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  return { push, pending, failed, retry: flush };
}

function Session({ data, onRestart }: { data: LoadedSession; onRestart: () => void }) {
  const { config } = data;
  const [state, setState] = useState<SessionState>(() => createSession(data.cards, data.load));
  const [startedAt] = useState(() => Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const shownAt = useRef(0);
  const writer = useAnswerWriter();

  const speech: SpeechPrefs = useMemo(() => ({ rate: config.ttsRate, voice: config.ttsVoice }), [config]);
  const ctx = useMemo(() => ({ settings: config.settings, today: config.today }), [config]);
  const env = useMemo(
    () => ({
      pool: data.pool,
      canSpeak: canSpeak(),
      random: Math.random,
      gateSteps: config.settings.productionGateSteps,
      ladderLength: config.settings.ladder.length,
    }),
    [data.pool, config.settings],
  );

  const sc = currentCard(state);
  // One exercise per position: re-planning on every render would reshuffle options.
  const exercise = useMemo(() => (sc ? planExercise(sc, env) : null), [state.position, env]); // eslint-disable-line react-hooks/exhaustive-deps
  const intervals = useMemo(() => (sc ? previewIntervals(sc, { ...ctx, now: new Date() }) : null), [sc, ctx]);

  useEffect(() => {
    shownAt.current = performance.now();
  }, [state.position]);

  const onAnswer = useCallback(
    (result: ReviewResult | null, responseText?: string) => {
      if (!exercise) return;
      const now = new Date();
      const r = answerCard(state, result, { ...ctx, now });
      setState(r.state);
      if (isFinished(r.state)) setFinishedAt(now.getTime());
      writer.push({
        clientId: crypto.randomUUID(),
        reviewedAt: now.toISOString(),
        method: exercise.method,
        result,
        responseText: responseText ?? null,
        responseMs: Math.round(performance.now() - shownAt.current),
        outcome: r.outcome,
        siblingPatch: r.siblingPatch,
      });
    },
    [state, ctx, exercise, writer],
  );

  const total = state.order.length;
  const progress = total ? state.position / total : 1;

  return (
    <>
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            href="/bugun"
            aria-label={uz.review.close}
            className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-sunken hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-6" aria-hidden />
          </Link>
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-label={uz.today.progressLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div
              className="h-full rounded-full bg-highlight transition-[width] duration-500 ease-(--ease-out-soft)"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-sm font-semibold text-muted-foreground tabular-nums">
            {uz.review.left(remaining(state))}
          </span>
        </div>
        <SaveStatus pending={writer.pending} failed={writer.failed} onRetry={writer.retry} />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-4 pb-10">
        {isFinished(state) || !sc || !exercise ? (
          <Summary
            state={state}
            minutes={Math.max(1, Math.round(((finishedAt ?? startedAt) - startedAt) / 60_000))}
            dueRemaining={data.dueRemaining}
            onRestart={onRestart}
            saving={writer.pending > 0}
          />
        ) : (
          <div key={state.position} className="animate-rise flex flex-1 flex-col gap-5">
            <p className="text-center text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {uz.review.methods[exercise.method]}
            </p>

            {isProductionPending(sc, env) ? (
              <p className="flex items-start gap-2 rounded-xl bg-highlight-soft px-4 py-3 text-sm text-highlight-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {uz.review.productionPending}
              </p>
            ) : null}

            {exercise.kind === "encounter" ? (
              <EncounterView item={sc.item} speech={speech} onAnswer={onAnswer} />
            ) : exercise.kind === "choice" ? (
              <ChoiceView ex={exercise} speech={speech} onAnswer={onAnswer} />
            ) : exercise.kind === "recall" ? (
              <RecallView ex={exercise} speech={speech} intervals={intervals!} onAnswer={onAnswer} />
            ) : exercise.kind === "spelling" ? (
              <SpellingView ex={exercise} onAnswer={onAnswer} />
            ) : exercise.kind === "listening" ? (
              <ListeningView ex={exercise} speech={speech} onAnswer={onAnswer} />
            ) : exercise.kind === "cloze" ? (
              <ClozeView ex={exercise} onAnswer={onAnswer} />
            ) : (
              <OrderView ex={exercise} speech={speech} onAnswer={onAnswer} />
            )}

            <p className="mt-auto hidden pt-6 text-center text-xs text-muted-foreground md:block">
              {uz.review.keyboardHint}
            </p>
          </div>
        )}
      </main>
    </>
  );
}

function SaveStatus({ pending, failed, onRetry }: { pending: number; failed: boolean; onRetry: () => void }) {
  if (!pending) return null;
  return (
    <div
      role={failed ? "alert" : "status"}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold",
        failed ? "bg-destructive-soft text-destructive" : "text-muted-foreground",
      )}
    >
      {failed ? (
        <CloudOff className="size-3.5" aria-hidden />
      ) : (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      )}
      {failed ? uz.review.saveFailed(pending) : uz.review.saving(pending)}
      {failed ? (
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          {uz.review.retry}
        </button>
      ) : null}
    </div>
  );
}

function Summary({
  state,
  minutes,
  dueRemaining,
  onRestart,
  saving,
}: {
  state: SessionState;
  minutes: number;
  dueRemaining: number;
  onRestart: () => void;
  /** Answers still being written: reloading now would read stale cards. */
  saving: boolean;
}) {
  const acc = accuracy(state.stats);
  const t = uz.review;
  return (
    <section className="animate-rise flex flex-1 flex-col items-center justify-center gap-6 py-6 text-center">
      <ProgressRing value={acc ?? 1} label={t.accuracy} size={144} stroke={12}>
        <span className="leading-none">
          <span className="block font-display text-4xl font-semibold tabular-nums">
            {acc === null ? "—" : `${Math.round(acc * 100)}%`}
          </span>
          <span className="mt-1 block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t.accuracy}
          </span>
        </span>
      </ProgressRing>
      <div>
        <h1 className="font-display text-3xl font-semibold">{t.doneTitle}</h1>
        <p className="mt-2 text-muted-foreground">{t.doneBody(state.touched.length, minutes)}</p>
      </div>
      <dl className="grid w-full max-w-sm grid-cols-4 gap-2">
        {(["again", "hard", "good", "easy"] as const).map((r) => (
          <div key={r} className="rounded-xl border bg-card px-2 py-3 shadow-(--shadow-soft)">
            <dt className="text-[11px] font-semibold text-muted-foreground">{t.grades[r]}</dt>
            <dd className="font-display text-2xl font-semibold tabular-nums">{state.stats[r]}</dd>
          </div>
        ))}
      </dl>
      {dueRemaining > 0 ? <p className="text-sm text-muted-foreground">{t.moreDue(dueRemaining)}</p> : null}
      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button asChild size="lg">
          <Link href="/bugun">{t.backToday}</Link>
        </Button>
        <Button variant="outline" onClick={onRestart} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
          {t.again}
        </Button>
      </div>
    </section>
  );
}
