"use client";

import { useEffect, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Exercise, SessionItem } from "@/lib/session/exercise";
import type { ReviewResult } from "@/lib/srs/types";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import {
  ContinueButton,
  Prompt,
  SpeakButton,
  TypedAnswer,
  useEnter,
  type ExerciseProps,
  type SpeechPrefs,
} from "./shared";

type Of<K extends Exercise["kind"]> = Extract<Exercise, { kind: K }>;

// ---------- 1. Encounter -------------------------------------------------

export function EncounterView({
  item,
  speech,
  onAnswer,
  second,
}: ExerciseProps & { item: SessionItem; speech: SpeechPrefs; second?: boolean }) {
  useEnter(() => onAnswer(null));
  return (
    <div className="flex flex-col gap-6">
      {second ? (
        <p className="rounded-xl bg-primary-soft px-4 py-3 text-sm font-medium text-primary-soft-foreground">
          {uz.review.secondDirection}
        </p>
      ) : null}
      <div className="bg-ruled rounded-2xl border bg-card px-5 py-8 text-center shadow-(--shadow-lift)">
        <Prompt lang="en">{item.english}</Prompt>
        {item.part_of_speech ? (
          <p className="mt-1 text-sm text-muted-foreground italic">{item.part_of_speech}</p>
        ) : null}
        <p className="mt-4 text-xl font-semibold text-primary" lang="uz">
          {item.uzbek}
        </p>
        {item.example_en ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl bg-background/70 px-4 py-3 text-left">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {uz.review.example}
            </p>
            <p className="mt-1 italic" lang="en">
              {item.example_en}
            </p>
            {item.example_uz ? (
              <p className="mt-1 text-sm text-muted-foreground" lang="uz">
                {item.example_uz}
              </p>
            ) : null}
          </div>
        ) : null}
        {item.notes ? (
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            <span className="font-semibold">{uz.review.notes}:</span> {item.notes}
          </p>
        ) : null}
      </div>
      <SpeakButton text={item.english} prefs={speech} autoPlay />
      <Button size="lg" className="w-full" autoFocus onClick={() => onAnswer(null)}>
        {uz.review.gotIt}
      </Button>
    </div>
  );
}

// ---------- 2. Multiple choice ---------------------------------------------

export function ChoiceView({
  ex,
  speech,
  onAnswer,
}: ExerciseProps & { ex: Of<"choice">; speech: SpeechPrefs }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === ex.correct;
  const finish = () => onAnswer(right ? "good" : "again", ex.options[picked ?? 0]);
  useEnter(finish, picked !== null);

  // Number keys 1–4 pick an option.
  useEffect(() => {
    if (picked !== null) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= ex.options.length) setPicked(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picked, ex.options.length]);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border bg-card px-5 py-8 shadow-(--shadow-lift)">
        <Prompt lang={ex.promptLang}>{ex.prompt}</Prompt>
        {ex.promptLang === "en" ? (
          <div className="mt-4">
            <SpeakButton text={ex.prompt} prefs={speech} />
          </div>
        ) : null}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2" role="list">
        {ex.options.map((opt, i) => {
          const state =
            picked === null ? "idle" : i === ex.correct ? "correct" : i === picked ? "wrong" : "dim";
          return (
            <li key={opt}>
              <button
                type="button"
                disabled={picked !== null}
                onClick={() => setPicked(i)}
                lang={ex.promptLang === "en" ? "uz" : "en"}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-base font-semibold shadow-(--shadow-soft) transition-colors outline-none",
                  "hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default",
                  state === "correct" && "border-success bg-success-soft text-success",
                  state === "wrong" && "border-destructive bg-destructive-soft text-destructive",
                  state === "dim" && "opacity-50",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sunken text-xs text-muted-foreground">
                  {state === "correct" ? (
                    <Check className="size-4" aria-hidden />
                  ) : state === "wrong" ? (
                    <X className="size-4" aria-hidden />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">{opt}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {picked !== null ? (
        <>
          <p
            role="status"
            className={cn("text-center font-semibold", right ? "text-success" : "text-destructive")}
          >
            {right ? uz.review.correct : uz.review.wrong}
          </p>
          <ContinueButton onClick={finish} />
        </>
      ) : null}
    </div>
  );
}

// ---------- 3. Recall (flashcard, self-graded) --------------------------------

export function RecallView({
  ex,
  speech,
  intervals,
  onAnswer,
}: ExerciseProps & { ex: Of<"recall">; speech: SpeechPrefs; intervals: Record<ReviewResult, number> }) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) {
        onAnswer((["again", "hard", "good", "easy"] as const)[Number(e.key) - 1]!);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, onAnswer]);

  const english = ex.promptLang === "en" ? ex.prompt : ex.answer;
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border bg-card px-5 py-8 shadow-(--shadow-lift)">
        <Prompt lang={ex.promptLang}>{ex.prompt}</Prompt>
        <div
          className={cn(
            "mt-6 border-t border-dashed pt-6 transition-opacity",
            shown ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!shown}
        >
          <Prompt lang={ex.promptLang === "en" ? "uz" : "en"} className="text-primary">
            {ex.answer}
          </Prompt>
          <div className="mt-4">
            {shown ? <SpeakButton text={english} prefs={speech} autoPlay={ex.promptLang === "uz"} /> : null}
          </div>
        </div>
      </div>

      {shown ? (
        <div>
          <p className="mb-2 text-center text-xs font-semibold text-muted-foreground">
            {uz.review.gradeHint}
          </p>
          <GradeButtons intervals={intervals} onGrade={(r) => onAnswer(r)} />
        </div>
      ) : (
        <Button size="lg" className="w-full" autoFocus onClick={() => setShown(true)}>
          {uz.review.show}
        </Button>
      )}
    </div>
  );
}

const GRADE_STYLE: Record<ReviewResult, string> = {
  again: "border-destructive/30 bg-destructive-soft text-destructive",
  hard: "border-warning/30 bg-warning-soft text-warning",
  good: "border-success/30 bg-success-soft text-success",
  easy: "border-primary/30 bg-primary-soft text-primary-soft-foreground",
};

export function GradeButtons({
  intervals,
  onGrade,
}: {
  intervals: Record<ReviewResult, number>;
  onGrade: (r: ReviewResult) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {(["again", "hard", "good", "easy"] as const).map((r, i) => (
        <button
          key={r}
          type="button"
          onClick={() => onGrade(r)}
          className={cn(
            "flex h-16 flex-col items-center justify-center rounded-xl border text-sm font-bold shadow-(--shadow-soft) transition-transform outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95",
            GRADE_STYLE[r],
          )}
          aria-keyshortcuts={String(i + 1)}
        >
          {uz.review.grades[r]}
          <span className="text-[11px] font-semibold opacity-80">{uz.review.interval(intervals[r])}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- 4–6. Typed exercises ---------------------------------------------

export function SpellingView({ ex, onAnswer }: ExerciseProps & { ex: Of<"spelling"> }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border bg-card px-5 py-8 shadow-(--shadow-lift)">
        <Prompt lang="uz">{ex.prompt}</Prompt>
      </div>
      <TypedAnswer expected={ex.answer} onAnswer={onAnswer} />
    </div>
  );
}

export function ListeningView({
  ex,
  speech,
  onAnswer,
}: ExerciseProps & { ex: Of<"listening">; speech: SpeechPrefs }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-5 py-8 shadow-(--shadow-lift)">
        <SpeakButton text={ex.say} prefs={speech} autoPlay />
        <p className="text-sm text-muted-foreground" lang="uz">
          {ex.hint}
        </p>
      </div>
      <TypedAnswer expected={ex.answer} onAnswer={onAnswer} />
    </div>
  );
}

export function ClozeView({ ex, onAnswer }: ExerciseProps & { ex: Of<"cloze"> }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-sm text-muted-foreground" lang="uz">
        {ex.hint}
      </p>
      <TypedAnswer expected={ex.answer} before={ex.before} after={ex.after} onAnswer={onAnswer} />
    </div>
  );
}

// ---------- 6. Word order -------------------------------------------------------

export function OrderView({
  ex,
  speech,
  onAnswer,
}: ExerciseProps & { ex: Of<"order">; speech: SpeechPrefs }) {
  // Indices into ex.tokens, in the order the learner tapped them.
  const [picked, setPicked] = useState<number[]>([]);
  const built = picked.map((i) => ex.tokens[i]!);
  // Checked automatically once every token is placed; null while building.
  const checked = picked.length === ex.tokens.length ? built.join(" ") === ex.answer.join(" ") : null;

  const finish = () => onAnswer(checked ? "good" : "again", built.join(" "));
  useEnter(finish, checked !== null);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-center text-sm text-muted-foreground" lang="uz">
        {ex.hint}
      </p>
      <div
        lang="en"
        aria-live="polite"
        className={cn(
          "bg-ruled flex min-h-28 flex-wrap content-start gap-2 rounded-2xl border bg-card p-4 shadow-(--shadow-soft)",
          checked === true && "border-success",
          checked === false && "border-destructive",
        )}
      >
        {built.length === 0 ? (
          <span className="text-sm text-muted-foreground">{uz.review.orderHint}</span>
        ) : null}
        {picked.map((tokenIndex, pos) => (
          <button
            key={`${tokenIndex}-${pos}`}
            type="button"
            disabled={checked !== null}
            onClick={() => setPicked((p) => p.filter((_, k) => k !== pos))}
            className="h-10 rounded-lg border bg-primary-soft px-3 font-semibold text-primary-soft-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {ex.tokens[tokenIndex]}
          </button>
        ))}
      </div>

      <div lang="en" className="flex min-h-12 flex-wrap justify-center gap-2">
        {ex.tokens.map((tok, i) =>
          picked.includes(i) ? null : (
            <button
              key={i}
              type="button"
              onClick={() => setPicked((p) => [...p, i])}
              className="h-11 rounded-lg border bg-card px-3.5 font-semibold shadow-(--shadow-soft) outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95"
            >
              {tok}
            </button>
          ),
        )}
      </div>

      {checked === null ? (
        picked.length ? (
          <Button variant="ghost" onClick={() => setPicked([])}>
            <RotateCcw aria-hidden />
            {uz.review.orderReset}
          </Button>
        ) : null
      ) : (
        <>
          <div
            role="status"
            className={cn(
              "rounded-xl border px-4 py-3",
              checked
                ? "border-success/30 bg-success-soft text-success"
                : "border-destructive/30 bg-destructive-soft text-destructive",
            )}
          >
            <p className="font-semibold">{checked ? uz.review.correct : uz.review.wrong}</p>
            {!checked ? (
              <p className="mt-1 text-sm text-foreground" lang="en">
                <span className="text-muted-foreground">{uz.review.rightAnswer}</span> {ex.answer.join(" ")}
              </p>
            ) : null}
          </div>
          <SpeakButton text={ex.answer.join(" ")} prefs={speech} />
          <ContinueButton onClick={finish} />
        </>
      )}
    </div>
  );
}
