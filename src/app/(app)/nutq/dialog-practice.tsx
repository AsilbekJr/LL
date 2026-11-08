"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Languages,
  Lightbulb,
  Loader2,
  MessagesSquare,
  RotateCcw,
} from "lucide-react";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/form-controls";
import { ACTIVE_DAYS } from "@/lib/production/active";
import { FIX_CONTEXT, type DrillItem, type ProductionWrite } from "@/lib/production/api";
import { fetchDialogTurn } from "@/lib/speaking/client";
import { pickDialogWords, type DialogTurn } from "@/lib/speaking/dialog";
import { findRestart, judgeToFeedback } from "@/lib/speaking/judge";
import { fixPassed } from "@/lib/speaking/repeat";
import { usesTerm } from "@/lib/text/usage";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { useVerdict, VerdictView } from "./judge-result";
import { LevelPicker, SpokenAnswerInput, useSpeakingLevel, useSpokenAnswer } from "./speaking-shared";

interface Turn extends DialogTurn {
  word: DrillItem;
  /** client_id of the saved answer, so its correction can be marked as repeated. */
  clientId?: string;
  /** Final answer (after any retries) and whether it passed on the first try. */
  answer?: string;
  firstTry?: boolean;
  passed?: boolean;
  corrected?: string;
}

type Phase = "intro" | "talk" | "repeat" | "done";

/**
 * "Suhbat": a short spoken conversation with the AI coach. Each question is
 * built so the natural answer needs one of the learner's not-yet-active
 * words; every answer is judged strictly; failed answers come back at the
 * end to be repeated in their corrected form (and later in "Xatolar").
 */
export function DialogPractice({
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
  const [phase, setPhase] = useState<Phase>("intro");
  const [words, setWords] = useState<DrillItem[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [repeatIndex, setRepeatIndex] = useState(0);
  const answer = useSpokenAnswer();

  const ask = useMutation({
    mutationFn: async (v: { word: DrillItem; history: Turn[] }) => {
      const history = v.history.flatMap((h) => [
        { role: "coach" as const, text: h.question },
        ...(h.answer ? [{ role: "learner" as const, text: h.answer }] : []),
      ]);
      const turn = await fetchDialogTurn({
        level,
        word: { english: v.word.english, uzbek: v.word.uzbek },
        history: history.slice(-12),
      });
      return { ...turn, word: v.word } satisfies Turn;
    },
    onSuccess: (turn) => setTurns((ts) => [...ts, turn]),
  });

  const current = phase === "talk" ? turns[turns.length - 1] : undefined;
  const said = current && !current.answer ? answer.answer : null;
  const used = said && current ? usesTerm(said, current.word.english) : false;
  const restart = said ? findRestart(said) : null;
  const verdict = useVerdict(
    current && said
      ? {
          kind: "dialog",
          said,
          level,
          word: { english: current.word.english, uzbek: current.word.uzbek },
          prompt: current.question,
        }
      : null,
    { localPassed: used && !restart, aiEnabled },
  );

  if (!aiEnabled) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t.dialogIntro}</p>
        <Notice tone="warning" icon={AlertTriangle}>
          {t.dialogNeedsAi}
        </Notice>
      </div>
    );
  }

  function start() {
    const picked = pickDialogWords(items, progress, level, Math.random);
    if (!picked.length) return;
    setWords(picked);
    setTurns([]);
    setAttempts(0);
    setRepeatIndex(0);
    answer.reset();
    setPhase("talk");
    ask.mutate({ word: picked[0]!, history: [] });
  }

  /** Close the current turn with the last answer, save it, and ask the next question (or finish). */
  function advance() {
    if (!current || !said || !verdict || verdict.status === "checking") return;
    const passed = verdict.status === "pass";
    const corrected = !passed ? verdict.judge?.corrected?.trim() || undefined : undefined;
    const clientId = crypto.randomUUID();
    onSave([
      {
        clientId,
        itemId: current.word.id,
        mode: "spoken",
        exercise: "situation",
        context: "dialog",
        prompt: current.question,
        text: said,
        passed,
        durationMs: answer.rec.durationMs || null,
        aiFeedback: verdict.judge ? judgeToFeedback(verdict.judge) : null,
      },
    ]);
    const closed: Turn = {
      ...current,
      clientId,
      answer: said,
      passed,
      firstTry: passed && attempts === 0,
      corrected,
    };
    const history = [...turns.slice(0, -1), closed];
    setTurns(history);
    setAttempts(0);
    answer.reset();
    const nextWord = words[history.length];
    if (nextWord) ask.mutate({ word: nextWord, history });
    else setPhase(history.some((h) => h.corrected) ? "repeat" : "done");
  }

  function retry() {
    setAttempts((a) => a + 1);
    answer.reset();
  }

  const repeats = turns.filter((h) => h.corrected);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.dialogIntro}</p>

      {phase === "intro" ? (
        <>
          <LevelPicker value={level} onChange={setLevel} />
          <Button size="lg" onClick={start}>
            <MessagesSquare aria-hidden />
            {t.dialogStart}
          </Button>
        </>
      ) : null}

      {phase !== "intro" ? (
        <div className="flex flex-wrap gap-1.5" aria-label={t.dialogWords}>
          {words.map((w, i) => {
            const turn = turns[i];
            return (
              <span
                key={w.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                  turn?.answer
                    ? turn.passed
                      ? "border-success/40 bg-success-soft text-success"
                      : "border-warning/40 bg-warning-soft text-warning"
                    : i === turns.length - 1 && phase === "talk"
                      ? "border-primary/40 bg-primary-soft text-primary"
                      : "bg-background text-muted-foreground",
                )}
              >
                {turn?.passed ? <CheckCircle2 className="size-3.5" aria-hidden /> : null}
                <span lang="en">{w.english}</span>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Conversation so far */}
      {phase !== "intro" ? (
        <ol className="flex flex-col gap-3">
          {turns.map((turn, i) => (
            <li key={i} className="flex flex-col gap-2">
              <Bubble who="coach">
                <p lang="en" className="font-semibold">
                  {turn.question}
                </p>
                {i === turns.length - 1 && !turn.answer && phase === "talk" ? (
                  <QuestionHelp turn={turn} speech={speech} progress={progress.get(turn.word.id) ?? 0} />
                ) : null}
              </Bubble>
              {turn.answer ? (
                <Bubble who="me" tone={turn.passed ? "ok" : "warn"}>
                  <p lang="en">{turn.answer}</p>
                  {turn.corrected ? (
                    <p className="mt-1 text-sm font-semibold text-success" lang="en">
                      → {turn.corrected}
                    </p>
                  ) : null}
                </Bubble>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {phase === "talk" && ask.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.dialogThinking}
        </p>
      ) : null}

      {phase === "talk" && ask.isError ? (
        <Notice tone="danger" icon={AlertTriangle}>
          {t.dialogError}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              const word = words[turns.length];
              if (word) ask.mutate({ word, history: turns });
            }}
          >
            {uz.common.retry}
          </button>
        </Notice>
      ) : null}

      {current && !current.answer && !ask.isPending ? (
        <>
          {!said ? <SpokenAnswerInput state={answer} /> : null}
          {said && verdict ? (
            <>
              <VerdictView
                verdict={verdict}
                said={said}
                speech={speech}
                localMessage={
                  restart ? t.restart(restart) : !used ? t.dialogUseWord(current.word.english) : undefined
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={retry}>
                  <RotateCcw aria-hidden />
                  {t.dialogRetry}
                </Button>
                <Button onClick={advance} disabled={verdict.status === "checking"} autoFocus>
                  {turns.length < words.length ? t.dialogNext : t.dialogFinish}
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {phase === "repeat" && repeats[repeatIndex] ? (
        <RepeatCorrection
          key={repeatIndex}
          turn={repeats[repeatIndex]!}
          speech={speech}
          position={`${repeatIndex + 1} / ${repeats.length}`}
          onSave={onSave}
          onNext={() => (repeatIndex + 1 < repeats.length ? setRepeatIndex((i) => i + 1) : setPhase("done"))}
        />
      ) : null}

      {phase === "done" ? (
        <section className="rounded-2xl border bg-card p-5 text-center shadow-(--shadow-soft)">
          <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />
          <h3 className="mt-2 font-display text-xl font-semibold">{t.dialogDone}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t.dialogScore(turns.filter((h) => h.firstTry).length, turns.length)}
          </p>
          <Button className="mt-4" onClick={() => setPhase("intro")}>
            <MessagesSquare aria-hidden />
            {t.dialogNew}
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function Bubble({
  who,
  tone,
  children,
}: {
  who: "coach" | "me";
  tone?: "ok" | "warn";
  children: React.ReactNode;
}) {
  const t = uz.speaking;
  return (
    <div className={cn("flex flex-col", who === "me" ? "items-end" : "items-start")}>
      <span className="mb-0.5 text-[11px] font-semibold text-muted-foreground">
        {who === "me" ? t.you : t.coach}
      </span>
      <div
        className={cn(
          "max-w-[92%] rounded-2xl border px-4 py-3",
          who === "coach" && "rounded-tl-md bg-card shadow-(--shadow-soft)",
          who === "me" && "rounded-tr-md",
          who === "me" && tone === "ok" && "border-success/30 bg-success-soft",
          who === "me" && tone === "warn" && "border-warning/30 bg-warning-soft",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function QuestionHelp({ turn, speech, progress }: { turn: Turn; speech: SpeechPrefs; progress: number }) {
  const t = uz.speaking;
  const [open, setOpen] = useState<"none" | "uz" | "hint">("none");
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SpeakButton key={turn.question} text={turn.question} prefs={speech} autoPlay />
        <Button variant="ghost" size="sm" onClick={() => setOpen(open === "uz" ? "none" : "uz")}>
          <Languages aria-hidden />
          {t.dialogTranslate}
        </Button>
        {turn.hint_uz ? (
          <Button variant="ghost" size="sm" onClick={() => setOpen(open === "hint" ? "none" : "hint")}>
            <Lightbulb aria-hidden />
            {t.dialogHint}
          </Button>
        ) : null}
      </div>
      {open === "uz" ? <p className="text-sm text-muted-foreground">{turn.question_uz}</p> : null}
      {open === "hint" ? <p className="text-sm text-muted-foreground">{turn.hint_uz}</p> : null}
      <p className="rounded-lg bg-highlight-soft px-3 py-1.5 text-sm font-semibold text-highlight-foreground">
        {t.dialogUseWord(turn.word.english)} <span className="font-normal">— {turn.word.uzbek}</span>
        <span className="block text-xs font-normal">
          {progress >= ACTIVE_DAYS ? t.activeDone : t.activeProgress(progress, ACTIVE_DAYS)}
        </span>
      </p>
    </div>
  );
}

/** End of a conversation: say each corrected sentence once, cleanly. */
function RepeatCorrection({
  turn,
  speech,
  position,
  onSave,
  onNext,
}: {
  turn: Turn;
  speech: SpeechPrefs;
  position: string;
  onSave: (rows: ProductionWrite[]) => void;
  onNext: () => void;
}) {
  const t = uz.speaking;
  const answer = useSpokenAnswer();
  const target = turn.corrected ?? "";
  const result = answer.answer ? fixPassed(answer.answer, target) : null;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
      <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {t.fixSay} · {position}
      </p>
      <p className="font-display text-2xl leading-snug font-semibold" lang="en">
        {target}
      </p>
      <SpeakButton key={target} text={target} prefs={speech} autoPlay />
      {!answer.answer ? <SpokenAnswerInput state={answer} /> : null}
      {result && answer.answer ? (
        <p
          role="status"
          className={cn("text-sm font-semibold", result.passed ? "text-success" : "text-warning")}
        >
          {result.passed ? t.fixPassed : t.fixRetry(Math.round(result.similarity * 100))}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => answer.reset()} disabled={!answer.answer}>
          <RotateCcw aria-hidden />
          {uz.production.redo}
        </Button>
        <Button
          onClick={() => {
            if (result?.passed && answer.answer) {
              onSave([
                {
                  clientId: crypto.randomUUID(),
                  itemId: turn.word.id,
                  mode: "spoken",
                  exercise: "shadowing",
                  // Marks the failed answer as repeated, so "Xatolar" does not ask again.
                  context: turn.clientId ? `${FIX_CONTEXT}${turn.clientId}` : "dialog-fix",
                  prompt: target,
                  text: answer.answer,
                  passed: true,
                  durationMs: answer.rec.durationMs || null,
                },
              ]);
            }
            onNext();
          }}
        >
          {result?.passed ? t.fixNext : t.fixSkip}
        </Button>
      </div>
    </section>
  );
}
