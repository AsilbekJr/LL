"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  AudioLines,
  Ellipsis,
  MessagesSquare,
  Wrench,
  LayoutTemplate,
  CheckCircle2,
  Circle,
  Loader2,
  Mic,
  RefreshCw,
  Shuffle,
  Square,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ShadowingTask } from "@/components/production/production-task";
import { Button } from "@/components/ui/button";
import { Notice, Textarea } from "@/components/ui/form-controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchPracticeItems,
  fetchSpokenUses,
  saveProductions,
  type DrillItem,
  type ProductionWrite,
} from "@/lib/production/api";
import { ACTIVE_DAYS, activeCount, spokenDays } from "@/lib/production/active";
import { pickContext } from "@/lib/production/contexts";
import { DRILL_MAX_SECONDS, pickDrillTargets, scoreDrill, shadowSentence } from "@/lib/production/drill";
import { canRecognize, listen, type Listener } from "@/lib/speech/stt";
import type { CefrLevel } from "@/lib/supabase/database.types";
import { VOCAB_LEVELS } from "@/lib/vocab/dictionary";
import { loadExamples } from "@/lib/vocab/sentences";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { DialogPractice } from "./dialog-practice";
import { FixPractice } from "./fix-practice";
import { PatternDrill } from "./pattern-drill";
import { TranslationDrill } from "./translation-drill";

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
  initialTab?: "dialog" | "pattern" | "fix" | "more";
}) {
  const t = uz.speaking;
  const items = useQuery({ queryKey: ["practice-items"], queryFn: () => fetchPracticeItems(sb()) });
  const uses = useQuery({ queryKey: ["spoken-uses"], queryFn: () => fetchSpokenUses(sb()) });
  const progress = useMemo(() => spokenDays(uses.data ?? []), [uses.data]);
  const save = useSave();
  const qc = useQueryClient();
  const speech = useMemo(() => ({ rate: ttsRate, voice: ttsVoice }), [ttsRate, ttsVoice]);
  const [extra, setExtra] = useState<"translate" | "drill" | "shadow">("translate");
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
      <Tabs defaultValue={initialTab ?? (aiEnabled ? "dialog" : "pattern")}>
        {/* Three core methods; the rest live under "Boshqa". */}
        <TabsList className="grid w-full grid-cols-4 [&>button]:gap-1.5 [&>button]:px-1 [&>button>svg]:hidden sm:[&>button>svg]:block">
          <TabsTrigger value="dialog">
            <MessagesSquare aria-hidden />
            {t.dialogTab}
          </TabsTrigger>
          <TabsTrigger value="pattern">
            <LayoutTemplate aria-hidden />
            {t.patternTab}
          </TabsTrigger>
          <TabsTrigger value="fix">
            <Wrench aria-hidden />
            {t.fixTab}
          </TabsTrigger>
          <TabsTrigger value="more">
            <Ellipsis aria-hidden />
            {t.moreTab}
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
        <TabsContent value="pattern">
          <PatternDrill
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
        <TabsContent value="more">
          <div role="radiogroup" aria-label={t.moreTab} className="mb-5 grid grid-cols-3 gap-1.5">
            {(
              [
                ["translate", t.translateTab],
                ["drill", t.drillTab],
                ["shadow", t.shadowTab],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={extra === key}
                onClick={() => setExtra(key)}
                className={cn(
                  "h-10 rounded-lg border px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  extra === key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card hover:border-primary/40",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {extra === "translate" ? (
            <TranslationDrill
              items={items.data}
              speech={speech}
              progress={progress}
              onSave={onSave}
              aiEnabled={aiEnabled}
            />
          ) : extra === "drill" ? (
            <Drill items={items.data} />
          ) : (
            <Shadowing items={items.data} speech={speech} />
          )}
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

// ---------- free speaking drill (stage 9) ---------------------------------

function Drill({ items }: { items: DrillItem[] }) {
  const t = uz.speaking;
  const save = useSave();
  const [setup, setSetup] = useState(() => ({
    targets: pickDrillTargets(items, Math.random),
    context: pickContext(Math.random),
  }));
  const [phase, setPhase] = useState<"ready" | "recording" | "done">("ready");
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [supported] = useState(() => canRecognize());
  const listener = useRef<Listener | null>(null);
  const startedAt = useRef(0);

  // Timer + hard stop at the maximum length.
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= DRILL_MAX_SECONDS) listener.current?.stop();
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => () => listener.current?.abort(), []);

  const score = useMemo(() => scoreDrill(text, setup.targets), [text, setup.targets]);

  function start() {
    setText("");
    setSeconds(0);
    startedAt.current = Date.now();
    setPhase("recording");
    if (!supported) return;
    listener.current = listen({
      onText: setText,
      onEnd: (final) => {
        setText(final);
        setPhase("done");
      },
    });
  }

  function finish() {
    if (supported) listener.current?.stop();
    else setPhase("done");
  }

  async function saveAndNext() {
    const drillId = crypto.randomUUID();
    const durationMs = seconds * 1000;
    if (text.trim()) {
      await save
        .mutateAsync(
          setup.targets.map((target) => ({
            clientId: crypto.randomUUID(),
            itemId: target.id,
            mode: "spoken" as const,
            exercise: "drill" as const,
            drillId,
            context: setup.context.id,
            prompt: setup.context.label,
            text,
            passed: score.used.has(target.id),
            durationMs,
          })),
        )
        .catch(() => undefined);
    }
    setSetup({
      targets: pickDrillTargets(items, Math.random),
      context: pickContext(Math.random, setup.context.id),
    });
    setText("");
    setPhase("ready");
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.drillIntro}</p>

      <section className="bg-ruled rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t.topic}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold">{setup.context.label}</p>
          </div>
          {phase === "ready" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSetup((s) => ({ ...s, context: pickContext(Math.random, s.context.id) }))}
            >
              <Shuffle aria-hidden />
              {t.newTopic}
            </Button>
          ) : null}
        </div>
        <p className="mt-5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {t.targets}
        </p>
        <ul className="mt-2 flex flex-wrap gap-2" aria-live="polite">
          {setup.targets.map((target) => {
            const used = score.used.has(target.id);
            return (
              <li
                key={target.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  used ? "border-success/40 bg-success-soft text-success" : "bg-background",
                )}
                title={target.uzbek}
              >
                {used ? (
                  <CheckCircle2 className="size-4" aria-hidden />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-hidden />
                )}
                <span lang="en">{target.english}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {phase === "ready" ? (
        <Button size="lg" onClick={start}>
          <Mic aria-hidden />
          {t.start}
        </Button>
      ) : null}

      {phase === "recording" ? (
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex items-center gap-2 font-display text-3xl font-semibold tabular-nums"
            role="timer"
          >
            <span className="size-3 animate-pulse rounded-full bg-destructive" aria-hidden />
            {t.seconds(seconds)}
          </div>
          {supported ? (
            <p
              className="min-h-16 w-full rounded-xl border bg-card px-4 py-3 text-lg"
              lang="en"
              aria-live="polite"
            >
              {text || <span className="text-muted-foreground">{uz.production.listening}</span>}
            </p>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t.typeInstead}</p>
              <Textarea rows={4} lang="en" value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
          <Button size="lg" variant="destructive" className="w-full" onClick={finish}>
            <Square className="fill-current" aria-hidden />
            {t.finish}
          </Button>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="flex flex-col gap-3">
          <Notice tone={score.count > 0 ? "success" : "warning"} icon={CheckCircle2}>
            {t.usedCount(score.count, score.total)}
          </Notice>
          {text ? (
            <p className="rounded-xl border bg-card px-4 py-3" lang="en">
              {text}
            </p>
          ) : null}
          <Button size="lg" onClick={saveAndNext} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            {t.newDrill}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- shadowing --------------------------------------------------------

function Shadowing({
  items,
  speech,
}: {
  items: DrillItem[];
  speech: { rate: number; voice: string | null };
}) {
  const t = uz.speaking;
  const save = useSave();
  // Items without their own example get one from the sentence bank (by level; unknown level → all).
  const levels = useMemo(() => {
    const need = items.filter((i) => !shadowSentence(i));
    if (!need.length) return [] as CefrLevel[];
    return need.some((i) => !i.cefr_level) ? VOCAB_LEVELS : [...new Set(need.map((i) => i.cefr_level!))];
  }, [items]);
  const bank = useQuery({
    queryKey: ["sentences", "examples", levels.join(",")],
    queryFn: async () =>
      Object.assign({}, ...(await Promise.all(levels.map(loadExamples)))) as Record<string, string[]>,
    enabled: levels.length > 0,
    staleTime: Infinity,
  });
  const candidates = useMemo(() => {
    const out: { item: DrillItem; sentence: string }[] = [];
    for (const item of items) {
      const own = shadowSentence(item);
      if (own) out.push({ item, sentence: own });
      else {
        const list = bank.data?.[item.english] ?? bank.data?.[item.english.toLowerCase()];
        for (const sentence of list ?? []) out.push({ item, sentence });
      }
    }
    return out;
  }, [items, bank.data]);
  const [index, setIndex] = useState(() => Math.floor(Math.random() * 1000));

  if (bank.isLoading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />;
  }
  if (!candidates.length) {
    return <EmptyState icon={AudioLines} title={t.emptyTitle} description={t.emptyBody} />;
  }
  const { item, sentence } = candidates[index % candidates.length]!;

  return (
    <ShadowingTask
      key={`${item.id}-${index}`}
      sentence={sentence}
      translation={item.type === "sentence" ? item.uzbek : null}
      speech={speech}
      onDone={(r) => {
        void save
          .mutateAsync([
            {
              clientId: crypto.randomUUID(),
              itemId: item.id,
              mode: "spoken",
              exercise: "shadowing",
              prompt: sentence,
              text: r.text,
              passed: r.passed,
              durationMs: r.durationMs,
            },
          ])
          .catch(() => undefined);
        setIndex((i) => i + 1 + Math.floor(Math.random() * Math.max(1, candidates.length - 1)));
      }}
    />
  );
}
