"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye, Loader2, RefreshCw, RotateCcw, Shuffle } from "lucide-react";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form-controls";
import { ACTIVE_DAYS } from "@/lib/production/active";
import type { DrillItem, ProductionWrite } from "@/lib/production/api";
import { checkPattern, type SpeakingPattern } from "@/lib/production/patterns";
import { fetchPatternFits } from "@/lib/speaking/client";
import type { PatternFit } from "@/lib/speaking/fit";
import { findRestart, judgeToFeedback } from "@/lib/speaking/judge";
import { pickSensiblePattern } from "@/lib/speaking/pattern-pick";
import { englishKey } from "@/lib/schemas/item";
import { loadAll } from "@/lib/vocab/dictionary";
import { uz } from "@/lib/i18n/uz";
import { useVerdict, VerdictView } from "./judge-result";
import { Check, LevelPicker, SpokenAnswerInput, useSpeakingLevel, useSpokenAnswer } from "./speaking-shared";

/** Fill in missing parts of speech from the built-in dictionary, so slot matching works for hand-added words. */
function useItemsWithPos(items: DrillItem[]) {
  const dict = useQuery({ queryKey: ["vocab", "all"], queryFn: loadAll, staleTime: Infinity });
  const pool = useMemo(() => {
    if (!dict.data) return items;
    const pos = new Map(dict.data.map((e) => [englishKey(e.english), e.pos]));
    return items.map((i) =>
      i.part_of_speech?.trim() ? i : { ...i, part_of_speech: pos.get(englishKey(i.english)) ?? null },
    );
  }, [items, dict.data]);
  return { pool, ready: !dict.isPending };
}

export function PatternDrill({
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
  const { pool, ready } = useItemsWithPos(items);
  const [level, setLevel] = useSpeakingLevel(items);
  const answer = useSpokenAnswer();

  // Each request is one pick: a frame + a word that make a SENSIBLE sentence
  // (checked by AI when on; part of speech alone gave "Can I have a guy?").
  const [request, setRequest] = useState<{
    n: number;
    avoid?: string;
    pattern?: string;
    excludeItem?: string;
  }>({
    n: 0,
  });
  const picked = useQuery({
    queryKey: ["pattern-pick", level, pool.length, aiEnabled, request],
    queryFn: async () => {
      const opts = {
        level,
        items: pool,
        random: Math.random,
        fits: aiEnabled ? fetchPatternFits : async () => null,
        avoid: request.avoid,
      };
      if (request.pattern) {
        const same = await pickSensiblePattern({
          ...opts,
          pattern: request.pattern,
          excludeItem: request.excludeItem,
        });
        if (same) return same;
      }
      return pickSensiblePattern(opts);
    },
    enabled: ready,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false,
  });
  const pick = picked.data ?? null;
  const picking = !ready || picked.isPending;

  const check = pick && answer.answer ? checkPattern(answer.answer, pick.pattern, pick.item.english) : null;
  const restart = answer.answer ? findRestart(answer.answer) : null;
  const verdict = useVerdict(
    pick && answer.answer
      ? {
          kind: "pattern",
          said: answer.answer,
          level,
          word: { english: pick.item.english, uzbek: pick.item.uzbek },
          prompt: pick.pattern.en,
        }
      : null,
    { localPassed: Boolean(check?.passed) && !restart, aiEnabled },
  );
  const checking = verdict?.status === "checking";

  function next() {
    if (pick && answer.answer && check && verdict && !checking) {
      onSave([
        {
          clientId: crypto.randomUUID(),
          itemId: pick.item.id,
          mode: "spoken",
          exercise: "pattern",
          context: pick.pattern.id,
          prompt: pick.pattern.en,
          text: answer.answer,
          passed: verdict.status === "pass",
          durationMs: answer.rec.durationMs || null,
          aiFeedback: verdict.judge ? judgeToFeedback(verdict.judge) : null,
        },
      ]);
    }
    answer.reset();
    setRequest((r) => ({ n: r.n + 1, avoid: pick?.pattern.id }));
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.patternIntro}</p>
      <LevelPicker value={level} onChange={setLevel} />

      {picking ? (
        <div
          className="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border bg-card text-sm text-muted-foreground"
          aria-busy="true"
        >
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {t.pickingPattern}
        </div>
      ) : !pick ? (
        <Notice tone="warning" icon={AlertTriangle}>
          {t.noFit}
        </Notice>
      ) : (
        <>
          <PatternCard
            pattern={pick.pattern}
            word={pick.item}
            days={progress.get(pick.item.id) ?? 0}
            speech={speech}
            model={pick.model}
          />

          {!answer.answer ? <SpokenAnswerInput state={answer} /> : null}

          {answer.answer && check && verdict ? (
            <div className="flex flex-col gap-3">
              <VerdictView
                verdict={verdict}
                said={answer.answer}
                speech={speech}
                localMessage={
                  restart
                    ? t.restart(restart)
                    : !check.used && check.keys.every(Boolean)
                      ? t.wordMissing(pick.item.english)
                      : !check.passed
                        ? t.patternRetry
                        : undefined
                }
                localChecks={
                  <>
                    {pick.pattern.keys.map((k, i) => (
                      <Check key={k} ok={check.keys[i]!} label={t.keyHeard(k.split("|")[0]!)} />
                    ))}
                    <Check ok={check.used} label={t.wordHeard(pick.item.english)} />
                  </>
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => answer.reset()}>
                  <RotateCcw aria-hidden />
                  {uz.production.redo}
                </Button>
                <Button autoFocus onClick={() => next()} disabled={checking}>
                  <RefreshCw aria-hidden />
                  {t.nextPattern}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => next()}>
                <Shuffle aria-hidden />
                {t.nextPattern}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setRequest((r) => ({ n: r.n + 1, pattern: pick.pattern.id, excludeItem: pick.item.id }))
                }
              >
                <RefreshCw aria-hidden />
                {t.otherWord}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PatternCard({
  pattern,
  word,
  days,
  speech,
  model,
}: {
  pattern: SpeakingPattern;
  word: DrillItem;
  days: number;
  speech: SpeechPrefs;
  model: PatternFit | null;
}) {
  const t = uz.speaking;
  const [shown, setShown] = useState<string | null>(null);
  const [before, after] = pattern.en.split("___");
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
      <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t.pattern}</p>
      {/* The frame with a gap, not pre-filled: dropping the word in mechanically
          can make nonsense ("It's too sleepy for me"); the learner builds the sentence. */}
      <p className="mt-1 font-display text-2xl leading-snug font-semibold" lang="en">
        {before}
        {after !== undefined ? (
          <>
            <span className="inline-block min-w-16 rounded-md border-b-2 border-dashed border-highlight-foreground/50 bg-highlight-soft px-1.5 text-center text-highlight-foreground">
              …
            </span>
            {after}
          </>
        ) : null}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-semibold">{t.meaning}:</span> {pattern.uz}
      </p>
      <p className="mt-2 text-sm">{t.patternHow}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sunken px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{t.yourWord}</p>
          <p className="font-semibold">
            <span lang="en">{word.english}</span>{" "}
            <span className="font-normal text-muted-foreground" lang="uz">
              — {word.uzbek}
            </span>
          </p>
        </div>
        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          {days >= ACTIVE_DAYS ? (
            <>
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              {t.activeDone}
            </>
          ) : (
            t.activeProgress(days, ACTIVE_DAYS)
          )}
        </span>
      </div>

      <div className="mt-4 border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground">{t.example}</p>
        <p className="mt-1 italic" lang="en">
          {pattern.example}
        </p>
        <div className="mt-2">
          <SpeakButton text={pattern.example} prefs={speech} />
        </div>
      </div>

      {model ? (
        <div className="mt-3 border-t pt-3">
          {shown === model.sentence ? (
            <>
              <p className="text-xs font-semibold text-muted-foreground">{t.modelWithWord(word.english)}</p>
              <p className="mt-1 font-semibold" lang="en">
                {model.sentence}
              </p>
              {model.sentence_uz ? (
                <p className="mt-0.5 text-sm text-muted-foreground" lang="uz">
                  {model.sentence_uz}
                </p>
              ) : null}
              <div className="mt-2">
                <SpeakButton text={model.sentence} prefs={speech} />
              </div>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setShown(model.sentence)}>
              <Eye aria-hidden />
              {t.showModel}
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
