"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw, Shuffle } from "lucide-react";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form-controls";
import { ACTIVE_DAYS } from "@/lib/production/active";
import type { DrillItem, ProductionWrite } from "@/lib/production/api";
import { checkPattern, fitsSlot, pickPattern, type SpeakingPattern } from "@/lib/production/patterns";
import { findRestart, judgeToFeedback } from "@/lib/speaking/judge";
import { englishKey } from "@/lib/schemas/item";
import { loadAll } from "@/lib/vocab/dictionary";
import { uz } from "@/lib/i18n/uz";
import { useVerdict, VerdictView } from "./judge-result";
import { Check, LevelPicker, SpokenAnswerInput, useSpeakingLevel, useSpokenAnswer } from "./speaking-shared";

/** Fill in missing parts of speech from the built-in dictionary, so slot matching works for hand-added words. */
function useItemsWithPos(items: DrillItem[]) {
  const dict = useQuery({ queryKey: ["vocab", "all"], queryFn: loadAll, staleTime: Infinity });
  return useMemo(() => {
    if (!dict.data) return items;
    const pos = new Map(dict.data.map((e) => [englishKey(e.english), e.pos]));
    return items.map((i) =>
      i.part_of_speech?.trim() ? i : { ...i, part_of_speech: pos.get(englishKey(i.english)) ?? null },
    );
  }, [items, dict.data]);
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
  const pool = useItemsWithPos(items);
  const [level, setLevel] = useSpeakingLevel(items);
  const [pick, setPick] = useState(() => pickPattern(level, pool, Math.random));
  const answer = useSpokenAnswer();

  // Re-pick when the level changes or the dictionary filled in parts of speech.
  const [seenKey, setSeenKey] = useState(`${level}:${pool.length}:${pool === items}`);
  const key = `${level}:${pool.length}:${pool === items}`;
  if (key !== seenKey) {
    setSeenKey(key);
    if (!pick || pick.pattern.level !== level) setPick(pickPattern(level, pool, Math.random));
  }

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
    setPick(pickPattern(level, pool, Math.random, pick?.pattern.id));
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.patternIntro}</p>
      <LevelPicker value={level} onChange={setLevel} />

      {!pick ? (
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
          />

          {!answer.answer ? <SpokenAnswerInput state={answer} /> : null}

          {answer.answer && check && verdict ? (
            <div className="flex flex-col gap-3">
              <VerdictView
                verdict={verdict}
                said={answer.answer}
                speech={speech}
                localMessage={restart ? t.restart(restart) : !check.passed ? t.patternRetry : undefined}
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
                onClick={() => {
                  const fits = pool.filter((i) => i.id !== pick.item.id && fitsSlot(pick.pattern.slot, i));
                  if (fits.length)
                    setPick({ pattern: pick.pattern, item: fits[Math.floor(Math.random() * fits.length)]! });
                }}
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
}: {
  pattern: SpeakingPattern;
  word: DrillItem;
  days: number;
  speech: SpeechPrefs;
}) {
  const t = uz.speaking;
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
    </section>
  );
}
