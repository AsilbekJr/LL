"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { fetchJudge } from "@/lib/speaking/client";
import { judgePassed, type Judge, type JudgeRequest } from "@/lib/speaking/judge";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { Check } from "./speaking-shared";

export type Verdict =
  | { status: "checking"; judge: null; fallback: false }
  | { status: "pass" | "fail"; judge: Judge | null; fallback: boolean };

/**
 * Two gates for a spoken answer: the offline check (chunks, word, no restart)
 * and then, when AI is on, the strict judge. Without AI, or when it is down,
 * the offline check decides (and `fallback` says so).
 */
export function useVerdict(
  req: JudgeRequest | null,
  opts: { localPassed: boolean; aiEnabled: boolean },
): Verdict | null {
  const run = Boolean(req) && opts.localPassed && opts.aiEnabled;
  const q = useQuery({
    queryKey: ["speaking-judge", req],
    queryFn: ({ signal }) => fetchJudge(req!, signal),
    enabled: run,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
  });
  if (!req) return null;
  if (!opts.localPassed) return { status: "fail", judge: null, fallback: false };
  if (!opts.aiEnabled) return { status: "pass", judge: null, fallback: false };
  if (q.isPending) return { status: "checking", judge: null, fallback: false };
  if (!q.data) return { status: "pass", judge: null, fallback: true };
  return { status: judgePassed(q.data) ? "pass" : "fail", judge: q.data, fallback: false };
}

/** Verdict box: what was heard, the five checks, concrete fixes and the sentence to say instead. */
export function VerdictView({
  verdict,
  said,
  speech,
  localChecks,
  localMessage,
}: {
  verdict: Verdict;
  said: string;
  speech: SpeechPrefs;
  /** Offline chips (chunks / word heard), shown when no judge result exists. */
  localChecks?: ReactNode;
  localMessage?: string;
}) {
  const t = uz.speaking;
  const j = verdict.judge;
  const pass = verdict.status === "pass";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border px-4 py-3",
        verdict.status === "checking"
          ? "bg-card"
          : pass
            ? "border-success/30 bg-success-soft text-success"
            : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      {verdict.status === "checking" ? (
        <p className="flex items-center gap-2 font-semibold text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t.judging}
        </p>
      ) : (
        <p className="font-semibold">{localMessage ?? (pass ? t.judgePassed : t.judgeFailed)}</p>
      )}
      <p className="mt-1 text-sm text-foreground" lang="en">
        <span className="text-muted-foreground">{uz.production.transcript}</span> {said}
      </p>

      {j ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Check ok={j.grammar_ok} label={t.checks.grammar} />
            <Check ok={j.natural} label={t.checks.meaning} />
            <Check ok={j.word_ok} label={t.checks.word} />
            <Check ok={j.task_ok} label={t.checks.task} />
            <Check ok={j.fluent} label={t.checks.fluent} />
          </div>
          {j.errors.length ? (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-foreground">
              {j.errors.map((e, i) => (
                <li key={i}>
                  <span className="text-destructive line-through" lang="en">
                    {e.fragment}
                  </span>
                  {e.correction ? (
                    <>
                      {" → "}
                      <span className="font-semibold text-success" lang="en">
                        {e.correction}
                      </span>
                    </>
                  ) : null}
                  <span className="block text-muted-foreground">{e.explanation_uz}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {!pass && j.corrected.trim() ? (
            <div className="mt-3 rounded-lg bg-card px-3 py-2 text-foreground">
              <p className="text-xs font-semibold text-muted-foreground">{t.sayThis}</p>
              <p className="mt-0.5 font-semibold" lang="en">
                {j.corrected}
              </p>
              <div className="mt-1.5">
                <SpeakButton text={j.corrected} prefs={speech} />
              </div>
            </div>
          ) : null}
          {j.feedback_uz ? <p className="mt-2 text-sm text-foreground">{j.feedback_uz}</p> : null}
        </>
      ) : localChecks ? (
        <div className="mt-2 flex flex-wrap gap-1.5">{localChecks}</div>
      ) : null}

      {verdict.status !== "checking" && verdict.fallback ? (
        <p className="mt-2 text-xs text-muted-foreground">{t.aiUnavailable}</p>
      ) : null}
    </div>
  );
}
