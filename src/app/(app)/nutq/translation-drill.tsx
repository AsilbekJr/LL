"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Eye, RefreshCw, RotateCcw } from "lucide-react";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form-controls";
import { ACTIVE_DAYS } from "@/lib/production/active";
import type { DrillItem, ProductionWrite } from "@/lib/production/api";
import { englishKey } from "@/lib/schemas/item";
import { findRestart, judgeToFeedback } from "@/lib/speaking/judge";
import { wordSimilarity } from "@/lib/text/usage";
import { loadTranslations, pickTranslation, type TranslationPrompt } from "@/lib/vocab/sentences";
import { uz } from "@/lib/i18n/uz";
import { useVerdict, VerdictView } from "./judge-result";
import { LevelPicker, SpokenAnswerInput, useSpeakingLevel, useSpokenAnswer } from "./speaking-shared";

export const TRANSLATE_PASS = 0.75;
export const TRANSLATE_CLOSE = 0.5;

export function TranslationDrill({
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
  const bank = useQuery({
    queryKey: ["sentences", "translate"],
    queryFn: loadTranslations,
    staleTime: Infinity,
  });
  const [level, setLevel] = useSpeakingLevel(items);
  const byKey = useMemo(() => new Map(items.map((i) => [englishKey(i.english), i])), [items]);
  const known = useMemo(() => new Set(byKey.keys()), [byKey]);
  const [current, setCurrent] = useState<{ prompt: TranslationPrompt; word: string | null } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const answer = useSpokenAnswer();

  // First pick / level change, once the bank is loaded.
  if (bank.data && (!current || current.prompt.level !== level)) {
    const next = pickTranslation(bank.data, level, known, Math.random);
    if (next !== current) setCurrent(next);
  }

  const item = current?.word ? (byKey.get(current.word) ?? null) : null;
  const similarity = current && answer.answer ? wordSimilarity(answer.answer, current.prompt.english) : null;
  const restart = answer.answer ? findRestart(answer.answer) : null;
  // With AI the judge decides (any correct wording counts); without it, closeness to the reference.
  const verdict = useVerdict(
    current && answer.answer
      ? {
          kind: "translation",
          said: answer.answer,
          level,
          word: item ? { english: item.english, uzbek: item.uzbek } : undefined,
          prompt: current.prompt.uzbek,
          reference: current.prompt.english,
        }
      : null,
    {
      localPassed: !restart && (aiEnabled || (similarity !== null && similarity >= TRANSLATE_PASS)),
      aiEnabled,
    },
  );
  const checking = verdict?.status === "checking";
  const passed = verdict?.status === "pass";

  if (bank.isPending) return <div className="h-64 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />;
  if (bank.isError) {
    return (
      <Notice tone="danger" icon={AlertTriangle}>
        {t.loadError}{" "}
        <button type="button" className="underline" onClick={() => bank.refetch()}>
          {uz.common.retry}
        </button>
      </Notice>
    );
  }

  const showAnswer = revealed || similarity !== null;

  function next() {
    if (current && item && answer.answer && verdict && !checking) {
      onSave([
        {
          clientId: crypto.randomUUID(),
          itemId: item.id,
          mode: "spoken",
          exercise: "translation",
          prompt: current.prompt.uzbek,
          text: answer.answer,
          passed,
          durationMs: answer.rec.durationMs || null,
          aiFeedback: verdict.judge ? judgeToFeedback(verdict.judge) : null,
        },
      ]);
    }
    answer.reset();
    setRevealed(false);
    setCurrent(
      bank.data ? pickTranslation(bank.data, level, known, Math.random, current?.prompt.english) : null,
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.translateIntro}</p>
      <LevelPicker value={level} onChange={setLevel} />

      {current ? (
        <>
          <section className="rounded-2xl border bg-card px-5 py-6 text-center shadow-(--shadow-lift)">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t.sayInEnglish}
            </p>
            <p className="mt-2 font-display text-2xl leading-snug font-semibold" lang="uz">
              {current.prompt.uzbek}
            </p>
            {item ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t.practising(item.english)} ·{" "}
                {(progress.get(item.id) ?? 0) >= ACTIVE_DAYS
                  ? t.activeDone
                  : t.activeProgress(progress.get(item.id) ?? 0, ACTIVE_DAYS)}
              </p>
            ) : null}
          </section>

          {!answer.answer ? <SpokenAnswerInput state={answer} /> : null}

          {verdict && answer.answer && similarity !== null ? (
            <VerdictView
              verdict={verdict}
              said={answer.answer}
              speech={speech}
              localMessage={
                restart
                  ? t.restart(restart)
                  : verdict.judge || verdict.status === "checking"
                    ? undefined
                    : `${passed ? t.translatePassed : similarity >= TRANSLATE_CLOSE ? t.translateClose : t.translateRetry} · ${uz.production.similarity(Math.round(similarity * 100))}`
              }
            />
          ) : null}

          {showAnswer ? (
            <div className="rounded-xl border bg-card px-4 py-3 text-center">
              <p className="text-xs font-semibold text-muted-foreground">{t.answer}</p>
              <p className="mt-1 text-lg font-semibold" lang="en">
                {current.prompt.english}
              </p>
              <div className="mt-2">
                <SpeakButton text={current.prompt.english} prefs={speech} />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {similarity !== null ? (
              <Button variant="outline" onClick={() => answer.reset()}>
                <RotateCcw aria-hidden />
                {uz.production.redo}
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setRevealed(true)} disabled={revealed}>
                <Eye aria-hidden />
                {t.showAnswer}
              </Button>
            )}
            <Button onClick={next} autoFocus={similarity !== null} disabled={checking}>
              <RefreshCw aria-hidden />
              {t.nextSentence}
            </Button>
          </div>
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">{t.sentencesSource}</p>
    </div>
  );
}
