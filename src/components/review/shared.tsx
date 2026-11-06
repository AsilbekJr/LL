"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, CircleAlert, Turtle, Volume2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkTyped, type TypedCheck } from "@/lib/text/answer";
import { canSpeak, preloadVoices, speak } from "@/lib/speech/tts";
import type { ReviewResult } from "@/lib/srs/types";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export interface ExerciseProps {
  onAnswer: (result: ReviewResult | null, responseText?: string) => void;
}

export interface SpeechPrefs {
  rate: number;
  voice: string | null;
}

/** Big prompt text in the right language (screen readers switch voice via lang). */
export function Prompt({
  children,
  lang,
  className,
}: {
  children: ReactNode;
  lang: "en" | "uz";
  className?: string;
}) {
  return (
    <p
      lang={lang}
      className={cn(
        "text-center font-display text-[clamp(1.75rem,6vw,2.75rem)] leading-tight font-semibold text-balance break-words",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function SpeakButton({
  text,
  prefs,
  autoPlay,
}: {
  text: string;
  prefs: SpeechPrefs;
  autoPlay?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const available = typeof window !== "undefined" && canSpeak();

  async function play(slow = false) {
    setPlaying(true);
    await speak(text, { rate: prefs.rate * (slow ? 0.7 : 1), voice: prefs.voice });
    setPlaying(false);
  }

  useEffect(() => {
    preloadVoices();
  }, []);

  useEffect(() => {
    if (autoPlay && available) void speak(text, { rate: prefs.rate, voice: prefs.voice });
  }, [autoPlay, available, text, prefs.rate, prefs.voice]);

  if (!available) return null;
  return (
    <div className="flex justify-center gap-2">
      <Button variant="secondary" onClick={() => play()} aria-label={uz.review.listen}>
        <Volume2 className={cn(playing && "animate-pulse")} aria-hidden />
        {uz.review.listen}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => play(true)}
        aria-label={uz.review.listenSlow}
        title={uz.review.listenSlow}
      >
        <Turtle aria-hidden />
      </Button>
    </div>
  );
}

/** Calls `fn` on Enter (outside text fields that handle their own Enter). */
export function useEnter(fn: () => void, enabled = true) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

export function ContinueButton({ onClick, autoFocus = true }: { onClick: () => void; autoFocus?: boolean }) {
  return (
    <Button size="lg" className="w-full" onClick={onClick} autoFocus={autoFocus}>
      {uz.review.next}
    </Button>
  );
}

export function Verdict({
  check,
  expected,
  typed,
}: {
  check: TypedCheck["verdict"];
  expected: string;
  typed?: string;
}) {
  const t = uz.review;
  const tone = {
    correct: { icon: CheckCircle2, text: t.correct, cls: "border-success/30 bg-success-soft text-success" },
    typo: { icon: CircleAlert, text: t.typo, cls: "border-warning/30 bg-warning-soft text-warning" },
    wrong: {
      icon: XCircle,
      text: t.wrong,
      cls: "border-destructive/30 bg-destructive-soft text-destructive",
    },
  }[check];
  const Icon = tone.icon;
  return (
    <div role="status" className={cn("animate-rise rounded-xl border px-4 py-3", tone.cls)}>
      <p className="flex items-center gap-2 font-semibold">
        <Icon className="size-5" aria-hidden />
        {tone.text}
      </p>
      {check !== "correct" ? (
        <div className="mt-2 space-y-1 text-sm text-foreground">
          <p>
            <span className="text-muted-foreground">{t.rightAnswer}</span>{" "}
            <span className="font-semibold" lang="en">
              {expected}
            </span>
          </p>
          {typed ? (
            <p>
              <span className="text-muted-foreground">{t.yourAnswer}</span> <span lang="en">{typed}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const VERDICT_RESULT: Record<TypedCheck["verdict"], ReviewResult> = {
  correct: "good",
  typo: "hard",
  wrong: "again",
};

/**
 * Text field + Check → verdict → Continue. Correct = Good, typo = Hard,
 * wrong = Again; the learner may override a strict "wrong" (e.g. a synonym).
 */
export function TypedAnswer({
  expected,
  onAnswer,
  before,
  after,
}: ExerciseProps & { expected: string; before?: string; after?: string }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<TypedCheck | null>(null);
  const inline = before !== undefined || after !== undefined;

  function submit() {
    if (!value.trim()) return;
    setResult(checkTyped(value, expected));
  }

  const finish = (r: ReviewResult) => onAnswer(r, value);
  useEnter(() => result && finish(VERDICT_RESULT[result.verdict]), result !== null);

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (result) finish(VERDICT_RESULT[result.verdict]);
          else submit();
        }}
        className="flex flex-col gap-4"
      >
        {inline ? (
          <p
            lang="en"
            className="rounded-2xl border bg-card px-5 py-6 text-center text-xl leading-relaxed shadow-(--shadow-soft)"
          >
            {before}
            <span className="mx-1 inline-block min-w-16 border-b-2 border-primary px-1 font-semibold text-primary">
              {result ? expected : value || " "}
            </span>
            {after}
          </p>
        ) : null}
        <Input
          autoFocus
          lang="en"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          value={value}
          readOnly={result !== null}
          onChange={(e) => setValue(e.target.value)}
          placeholder={uz.review.answerPlaceholder}
          aria-label={uz.review.answerPlaceholder}
          className={cn(
            "h-14 text-center text-lg",
            result?.verdict === "correct" && "border-success",
            result?.verdict === "typo" && "border-warning",
            result?.verdict === "wrong" && "border-destructive",
          )}
        />
        {result ? null : (
          <Button type="submit" size="lg" disabled={!value.trim()}>
            {uz.review.check}
          </Button>
        )}
      </form>
      {result ? (
        <>
          <Verdict
            check={result.verdict}
            expected={expected}
            typed={result.verdict === "correct" ? undefined : value}
          />
          <ContinueButton onClick={() => finish(VERDICT_RESULT[result.verdict])} />
          {result.verdict !== "correct" ? (
            <Button variant="ghost" onClick={() => finish("good")}>
              {uz.review.overrideCorrect}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
