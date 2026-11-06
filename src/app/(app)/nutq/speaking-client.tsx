"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  AudioLines,
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
  saveProductions,
  type DrillItem,
  type ProductionWrite,
} from "@/lib/production/api";
import { pickContext } from "@/lib/production/contexts";
import { DRILL_MAX_SECONDS, pickDrillTargets, scoreDrill, shadowSentence } from "@/lib/production/drill";
import { canRecognize, listen, type Listener } from "@/lib/speech/stt";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const sb = () => getSupabaseBrowserClient();

function useSave() {
  return useMutation({ mutationFn: (rows: ProductionWrite[]) => saveProductions(sb(), rows) });
}

export function SpeakingClient({ ttsRate, ttsVoice }: { ttsRate: number; ttsVoice: string | null }) {
  const t = uz.speaking;
  const items = useQuery({ queryKey: ["practice-items"], queryFn: () => fetchPracticeItems(sb()) });

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
    <Tabs defaultValue="drill">
      <TabsList className="w-full sm:w-auto">
        <TabsTrigger value="drill">
          <Mic aria-hidden />
          {t.drillTab}
        </TabsTrigger>
        <TabsTrigger value="shadow">
          <AudioLines aria-hidden />
          {t.shadowTab}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="drill">
        <Drill items={items.data} />
      </TabsContent>
      <TabsContent value="shadow">
        <Shadowing items={items.data} speech={{ rate: ttsRate, voice: ttsVoice }} />
      </TabsContent>
    </Tabs>
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
  const candidates = useMemo(() => items.filter((i) => shadowSentence(i)), [items]);
  const [index, setIndex] = useState(() => Math.floor(Math.random() * Math.max(1, candidates.length)));

  if (!candidates.length) {
    return <EmptyState icon={AudioLines} title={t.emptyTitle} description={t.emptyBody} />;
  }
  const item = candidates[index % candidates.length]!;
  const sentence = shadowSentence(item)!;

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
