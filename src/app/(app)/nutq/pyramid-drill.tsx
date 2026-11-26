"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  Info,
  Layers,
  Lightbulb,
  Loader2,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Wand2,
} from "lucide-react";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form-controls";
import { ACTIVE_DAYS } from "@/lib/production/active";
import type { DrillItem, ProductionWrite } from "@/lib/production/api";
import { pickDialogWords } from "@/lib/speaking/dialog";
import { fetchPyramidBuilder } from "@/lib/speaking/client";
import { HELP_MODEL, withHelp } from "@/lib/speaking/help";
import { findRestart, judgeToFeedback } from "@/lib/speaking/judge";
import {
  builderFromExample,
  checkPyramidStep,
  type Builder,
  PYRAMID_CONTEXT,
  PYRAMID_STEPS,
  pyramidPrompt,
  pyramidTerm,
  type PyramidStep,
} from "@/lib/speaking/pyramid";
import type { WordClass } from "@/lib/vocab/dictionary";
import { loadExamples } from "@/lib/vocab/sentences";
import { CelebrateOnMount } from "@/components/common/celebrate";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { useVerdict, VerdictView } from "./judge-result";
import { Check, LevelPicker, SpokenAnswerInput, useSpeakingLevel, useSpokenAnswer } from "./speaking-shared";

interface StepResult {
  step: PyramidStep;
  /** The sentence this step ends with (what the learner said, or the correction they took). */
  sentence: string;
  passed: boolean;
  firstTry: boolean;
}

/**
 * "Piramida": one word, one sentence, grown step by step. At every step the
 * learner says the whole sentence again with one new part; each step is
 * checked (offline gate, then the AI judge) and saved as a spoken
 * production, so passed steps count toward "active" and failed ones with a
 * correction land in "Xatolar".
 */
export function PyramidDrill({
  items,
  speech,
  progress,
  onSave,
  aiEnabled,
}: {
  items: DrillItem[];
  speech: SpeechPrefs;
  progress: Map<string, number>;
  onSave: (rows: ProductionWrite[]) => void;
  aiEnabled: boolean;
}) {
  const t = uz.speaking;
  const [level, setLevel] = useSpeakingLevel(items);
  const [seed, setSeed] = useState<{ n: number; avoid?: string }>({ n: 0 });
  const word = useMemo(() => {
    const pool = seed.avoid ? items.filter((i) => i.id !== seed.avoid) : items;
    return pickDialogWords(pool.length ? pool : items, progress, level, Math.random, 1)[0] ?? null;
    // `seed.n` re-rolls on purpose; progress changes alone must not swap the word mid-pyramid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, level, seed]);
  const info = useMemo(() => (word ? pyramidTerm(word) : null), [word]);
  // An example with the word: the item's own, else one from the sentence bank of its level.
  const exampleLevel = word?.cefr_level ?? level;
  const bank = useQuery({
    queryKey: ["sentences", "examples", exampleLevel],
    queryFn: () => loadExamples(exampleLevel),
    enabled: Boolean(word && !word.example_en?.trim()),
    staleTime: Infinity,
  });
  const example =
    word?.example_en?.trim() ||
    (info ? (bank.data?.[info.term]?.[0] ?? bank.data?.[info.term.toLowerCase()]?.[0]) : undefined) ||
    null;
  const [started, setStarted] = useState(false);
  // Step 1 builder: a situation to say (free), then pieces → start → model on request.
  const [situations, setSituations] = useState<{ n: number; shown: string[] }>({ n: 0, shown: [] });
  const [help, setHelp] = useState(0);
  const builderQ = useQuery({
    queryKey: ["pyramid-builder", word?.id, level, situations.n],
    queryFn: ({ signal }) =>
      fetchPyramidBuilder(
        {
          level,
          word: { english: info!.term, uzbek: word!.uzbek },
          wordClass: info!.wordClass,
          avoid: situations.shown.slice(-6),
        },
        signal,
      ),
    enabled: Boolean(started && word && info && aiEnabled),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const builder: Builder | null =
    builderQ.data ?? (aiEnabled && builderQ.isPending ? null : builderFromExample(example, info?.term ?? ""));
  const [drillId, setDrillId] = useState(() => crypto.randomUUID());
  const [results, setResults] = useState<StepResult[]>([]);
  const [attempts, setAttempts] = useState(0);
  const answer = useSpokenAnswer();

  const stepIndex = results.length;
  const step = PYRAMID_STEPS[stepIndex];
  const done = started && !step;
  const previous = results.at(-1)?.sentence ?? null;
  const said = started && step ? answer.answer : null;
  const situation = step === "base" ? builder?.situation_uz || null : null;
  const prompt = step ? pyramidPrompt(step, previous, situation) : "";

  const check = said && step && word ? checkPyramidStep(said, step, previous, word.english) : null;
  const term = info?.term ?? word?.english ?? "";
  const restart = said ? findRestart(said) : null;
  const verdict = useVerdict(
    said && word && step
      ? {
          kind: "pyramid",
          said,
          level,
          word: { english: term, uzbek: word.uzbek },
          prompt,
        }
      : null,
    { localPassed: Boolean(check?.passed) && !restart, aiEnabled },
  );
  const checking = verdict?.status === "checking";
  const passed = verdict?.status === "pass";
  const corrected = !passed ? verdict?.judge?.corrected.trim() || null : null;

  if (!word || !info) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t.pyramidIntro}</p>
        <Notice tone="warning" icon={Layers}>
          {t.pyramidNoWord}
        </Notice>
      </div>
    );
  }

  function reset(nextWord: boolean) {
    if (nextWord) setSeed((s) => ({ n: s.n + 1, avoid: word?.id }));
    setResults([]);
    setAttempts(0);
    setHelp(0);
    setSituations((v) => ({ n: v.n + 1, shown: [] }));
    setDrillId(crypto.randomUUID());
    answer.reset();
  }

  /** Save this step's final answer and move up the pyramid with `sentence`. */
  function advance(sentence: string) {
    if (!step || !word || !said || !verdict || checking) return;
    onSave([
      {
        clientId: crypto.randomUUID(),
        itemId: word.id,
        mode: "spoken",
        exercise: "situation",
        context: step === "base" ? withHelp(`${PYRAMID_CONTEXT}base`, help) : `${PYRAMID_CONTEXT}${step}`,
        drillId,
        prompt,
        text: said,
        passed,
        durationMs: answer.rec.durationMs || null,
        aiFeedback: verdict.judge ? judgeToFeedback(verdict.judge) : null,
      },
    ]);
    setResults((r) => [...r, { step, sentence, passed, firstTry: passed && attempts === 0 }]);
    setAttempts(0);
    answer.reset();
  }

  const days = progress.get(word.id) ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.pyramidIntro}</p>

      {!started ? <LevelPicker value={level} onChange={setLevel} /> : null}

      <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t.pyramidWord}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold">
              <span lang="en">{info.term}</span>{" "}
              {t.pyramidClass[info.wordClass] ? (
                <span className="mr-1 inline-block rounded-md bg-sunken px-1.5 py-0.5 align-middle font-sans text-xs font-semibold text-muted-foreground">
                  {t.pyramidClass[info.wordClass]}
                </span>
              ) : null}
              <span className="text-base font-normal text-muted-foreground" lang="uz">
                — {word.uzbek}
              </span>
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              {days >= ACTIVE_DAYS ? (
                <>
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                  {t.activeDone}
                </>
              ) : (
                t.activeProgress(days, ACTIVE_DAYS)
              )}
            </p>
          </div>
          {!started || (stepIndex === 0 && !said) ? (
            <Button variant="ghost" size="sm" onClick={() => reset(true)}>
              <Shuffle aria-hidden />
              {t.pyramidOtherWord}
            </Button>
          ) : null}
        </div>

        <StepRail current={done ? PYRAMID_STEPS.length : stepIndex} results={results} />
      </section>

      {!started ? (
        <Button size="lg" onClick={() => setStarted(true)}>
          <Layers aria-hidden />
          {t.pyramidStart}
        </Button>
      ) : null}

      {started && step ? (
        <>
          <StepCard
            key={step}
            step={step}
            index={stepIndex}
            previous={previous}
            speech={speech}
            wordClass={info.wordClass}
            showHow={stepIndex === 0 && !said}
          />

          {step === "base" ? (
            <BuilderPanel
              builder={builder}
              loading={aiEnabled && builderQ.isPending}
              term={info.term}
              help={help}
              onHelp={(h) => setHelp((v) => Math.max(v, h))}
              onOther={
                aiEnabled && !said
                  ? () => {
                      setHelp(0);
                      setSituations((v) => ({
                        n: v.n + 1,
                        shown: builder?.situation_uz ? [...v.shown, builder.situation_uz] : v.shown,
                      }));
                    }
                  : undefined
              }
              speech={speech}
            />
          ) : null}

          {!said ? <SpokenAnswerInput state={answer} /> : null}

          {said && check && verdict ? (
            <>
              <VerdictView
                verdict={verdict}
                said={said}
                speech={speech}
                localMessage={restart ? t.restart(restart) : !check.passed ? t.pyramidLocalRetry : undefined}
                localChecks={
                  <>
                    <Check ok={check.used} label={t.pyramidChecks.used(info.term)} />
                    {previous ? <Check ok={check.kept} label={t.pyramidChecks.kept} /> : null}
                    <Check ok={check.grew} label={t.pyramidChecks.grew} />
                    {step === "why" || step === "but" || step === "turn" ? (
                      <Check ok={check.marker} label={t.pyramidChecks.marker} />
                    ) : null}
                  </>
                }
              />
              {checking ? null : passed ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => answer.reset()}>
                    <RotateCcw aria-hidden />
                    {uz.production.redo}
                  </Button>
                  <Button autoFocus onClick={() => advance(said)}>
                    {stepIndex + 1 < PYRAMID_STEPS.length ? t.pyramidNext : t.pyramidFinish}
                    <ArrowRight aria-hidden />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button
                    autoFocus
                    onClick={() => {
                      setAttempts((a) => a + 1);
                      answer.reset();
                    }}
                  >
                    <RotateCcw aria-hidden />
                    {t.pyramidRetry}
                  </Button>
                  {corrected ? (
                    <Button variant="outline" onClick={() => advance(corrected)}>
                      <Wand2 aria-hidden />
                      {t.pyramidUseCorrected}
                    </Button>
                  ) : null}
                </div>
              )}
            </>
          ) : null}
        </>
      ) : null}

      {done ? (
        <section className="animate-rise rounded-2xl border bg-card p-5 shadow-(--shadow-soft)">
          <CelebrateOnMount />
          <div className="text-center">
            <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />
            <h3 className="mt-2 font-display text-xl font-semibold">{t.pyramidDone}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.pyramidScore(results.filter((r) => r.firstTry).length, results.length)}
            </p>
          </div>

          {results[3] ? (
            <div className="mt-4 rounded-xl bg-sunken px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground">{t.pyramidFinal}</p>
              <p className="mt-1 text-lg font-semibold" lang="en">
                {results[3].sentence}
              </p>
              <div className="mt-2">
                <SpeakButton text={results[3].sentence} prefs={speech} />
              </div>
            </div>
          ) : null}

          <p className="mt-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t.pyramidAll}
          </p>
          <ol className="mt-2 flex flex-col gap-2">
            {results.map((r, i) => (
              <li key={r.step} className="flex gap-3 text-sm">
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    r.passed ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
                  )}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span>
                  <span className="block text-xs text-muted-foreground">{t.pyramidSteps[r.step].title}</span>
                  <span lang="en">{r.sentence}</span>
                </span>
              </li>
            ))}
          </ol>

          <Button className="mt-5 w-full" onClick={() => reset(true)}>
            <RefreshCw aria-hidden />
            {t.pyramidNew}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function StepRail({ current, results }: { current: number; results: StepResult[] }) {
  const t = uz.speaking;
  return (
    <ol className="mt-4 grid grid-cols-5 gap-1.5" aria-label={t.pyramidAll}>
      {PYRAMID_STEPS.map((s, i) => {
        const r = results[i];
        return (
          <li key={s} className="flex flex-col gap-1" aria-current={i === current ? "step" : undefined}>
            <span
              className={cn(
                "h-1.5 rounded-full",
                r ? (r.passed ? "bg-success" : "bg-warning") : i === current ? "bg-primary" : "bg-sunken",
              )}
            />
            <span
              className={cn(
                "truncate text-[11px] font-semibold",
                i === current ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {t.pyramidSteps[s].title}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({
  step,
  index,
  previous,
  speech,
  wordClass,
  showHow,
}: {
  step: PyramidStep;
  index: number;
  previous: string | null;
  speech: SpeechPrefs;
  wordClass: WordClass;
  showHow: boolean;
}) {
  const t = uz.speaking;
  const s = t.pyramidSteps[step];
  const base = step === "base" ? t.pyramidBase[wordClass] : null;
  const task = base?.task ?? s.task;
  // Step 1 gets the builder below instead of generic frames.
  const tips = base ? [] : s.tips;
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-soft)">
      <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {t.pyramidStep(index + 1, PYRAMID_STEPS.length)} · {s.title}
      </p>
      <p className="mt-1 font-display text-xl leading-snug font-semibold">{task}</p>

      {previous ? (
        <div className="mt-4 rounded-xl bg-sunken px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground">{t.pyramidPrevious}</p>
          <p className="mt-1 text-lg font-semibold" lang="en">
            {previous}
          </p>
          <div className="mt-2">
            <SpeakButton key={previous} text={previous} prefs={speech} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t.pyramidSayWhole}</p>
        </div>
      ) : null}

      <ul className="mt-3 flex flex-wrap gap-1.5">
        {tips.map((tip) => (
          <li
            key={tip}
            className="rounded-full border bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground"
          >
            {tip}
          </li>
        ))}
      </ul>

      {showHow ? (
        <div className="mt-4 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Info className="size-4" aria-hidden />
            {t.pyramidHowTitle}
          </p>
          <ol className="mt-1.5 list-decimal pl-5 text-sm">
            {t.pyramidHow.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1">
        {index === 0 ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
            <Eye aria-hidden />
            {t.pyramidSampleShow}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 rounded-xl bg-sunken px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground">{t.pyramidSampleTitle}</p>
          <ol className="mt-1.5 flex flex-col gap-1 text-sm">
            {t.pyramidSample.map((line, i) => (
              <li key={line} className="flex gap-2">
                <span className="w-24 shrink-0 text-xs text-muted-foreground">
                  {t.pyramidSteps[PYRAMID_STEPS[i]!].title}
                </span>
                <span lang="en">{line}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Step 1 helper: the situation to say (no penalty), then — one tap at a
 * time — the English pieces, the start, and a model sentence.
 */
function BuilderPanel({
  builder,
  loading,
  term,
  help,
  onHelp,
  onOther,
  speech,
}: {
  builder: Builder | null;
  loading: boolean;
  term: string;
  help: number;
  onHelp: (step: number) => void;
  onOther?: () => void;
  speech: SpeechPrefs;
}) {
  const t = uz.speaking;
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t.builderLoading}
      </p>
    );
  }
  const steps = [
    {
      level: 2,
      label: t.builderChunks,
      body: builder?.chunks.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {builder.chunks.map((c) => (
            <li key={c} className="rounded-lg border bg-card px-2.5 py-1 font-semibold" lang="en">
              {c}
            </li>
          ))}
        </ul>
      ) : null,
    },
    {
      level: 3,
      label: t.builderStarter,
      body: builder?.starter ? (
        <p className="text-lg font-semibold" lang="en">
          {builder.starter}
        </p>
      ) : null,
    },
    {
      level: HELP_MODEL,
      label: t.builderModel,
      body: builder?.model ? (
        <>
          <p className="text-lg font-semibold" lang="en">
            {builder.model}
          </p>
          <div className="mt-1.5">
            <SpeakButton text={builder.model} prefs={speech} />
          </div>
          <p className="mt-1.5 text-xs text-warning">{t.builderModelNote}</p>
        </>
      ) : null,
    },
  ].filter((s) => s.body);
  const opened = steps.filter((s) => s.level <= help);
  const next = steps.find((s) => s.level > help);

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-highlight-foreground/20 bg-highlight-soft p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-highlight-foreground uppercase">
            {t.builderSituation}
          </p>
          <p className="mt-1 font-display text-xl leading-snug font-semibold" lang="uz">
            {builder?.situation_uz || t.builderOwn(term)}
          </p>
        </div>
        {onOther ? (
          <Button variant="ghost" size="sm" onClick={onOther}>
            <Shuffle aria-hidden />
            {t.builderOther}
          </Button>
        ) : null}
      </div>
      {opened.map((s) => (
        <div key={s.level} className="rounded-xl bg-card px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{s.label}</p>
          {s.body}
        </div>
      ))}
      {next ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => onHelp(next.level)}>
            <Lightbulb aria-hidden />
            {t.builderHelp(opened.length + 1, steps.length)} · {next.label.split(" — ")[0]}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
