"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Square,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Textarea } from "@/components/ui/form-controls";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { productionPrompt } from "@/lib/production/contexts";
import type { AiFeedback } from "@/lib/production/feedback";
import { canRecognize, listen, type Listener, type SttError } from "@/lib/speech/stt";
import {
  checkProduction,
  MIN_PRODUCTION_WORDS,
  wordSimilarity,
  type ProductionCheck,
} from "@/lib/text/usage";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { useAiFeedback } from "./use-ai-feedback";

export interface ProductionResult {
  passed: boolean;
  text: string;
  durationMs: number | null;
  feedback: AiFeedback | null;
}

interface TaskItem {
  english: string;
  uzbek: string;
}

// ---------- shared bits -----------------------------------------------------

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : Circle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold",
        ok ? "text-success" : "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

function Requirements({ check }: { check: ProductionCheck }) {
  const t = uz.production;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1" aria-live="polite">
      <Requirement ok={check.used} label={check.used ? t.wordUsed : t.wordMissing} />
      <Requirement ok={check.longEnough} label={t.minWords(MIN_PRODUCTION_WORDS)} />
    </div>
  );
}

function FeedbackCard({ feedback }: { feedback: AiFeedback }) {
  const t = uz.production;
  const clean = feedback.errors.length === 0 && feedback.word_used_correctly;
  return (
    <div className="animate-rise rounded-xl border border-primary/25 bg-primary-soft/50 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-primary-soft-foreground">
        <Sparkles className="size-4" aria-hidden />
        {clean ? t.aiCorrect : t.aiCorrected}
      </p>
      {!clean ? (
        <p className="mt-1 font-semibold" lang="en">
          {feedback.corrected}
        </p>
      ) : null}
      {feedback.errors.length ? (
        <ul className="mt-2 space-y-1.5">
          {feedback.errors.map((e, i) => (
            <li key={i}>
              <span className="text-destructive line-through" lang="en">
                {e.fragment}
              </span>{" "}
              →{" "}
              <span className="font-semibold text-success" lang="en">
                {e.correction}
              </span>
              <span className="block text-muted-foreground">{e.explanation_uz}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {feedback.tip_uz ? (
        <p className="mt-2 text-muted-foreground">
          <span className="font-semibold text-foreground">{t.aiTip}:</span> {feedback.tip_uz}
        </p>
      ) : null}
    </div>
  );
}

/** Result box after "Check" + optional AI feedback + Continue / Skip. */
function Outcome({
  check,
  term,
  aiEnabled,
  aiRequest,
  onContinue,
  onRetry,
  onSkip,
}: {
  check: ProductionCheck;
  term: string;
  aiEnabled: boolean;
  aiRequest: () => Promise<AiFeedback>;
  onContinue: (feedback: AiFeedback | null) => void;
  onRetry: () => void;
  onSkip: (feedback: AiFeedback | null) => void;
}) {
  const t = uz.production;
  const [feedback, setFeedback] = useState<AiFeedback | null>(null);
  const [aiState, setAiState] = useState<"idle" | "loading" | "error">("idle");

  async function runAi() {
    setAiState("loading");
    try {
      setFeedback(await aiRequest());
      setAiState("idle");
    } catch {
      setAiState("error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="status"
        className={cn(
          "animate-rise flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold",
          check.passed
            ? "border-success/30 bg-success-soft text-success"
            : "border-destructive/30 bg-destructive-soft text-destructive",
        )}
      >
        {check.passed ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        {check.passed ? t.passed : !check.used ? t.notUsed(term) : t.tooShort}
      </div>

      {aiEnabled && check.used ? (
        feedback ? (
          <FeedbackCard feedback={feedback} />
        ) : (
          <Button variant="secondary" onClick={runAi} disabled={aiState === "loading"}>
            {aiState === "loading" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Sparkles aria-hidden />
            )}
            {aiState === "loading" ? t.aiLoading : t.aiCheck}
          </Button>
        )
      ) : null}
      {aiState === "error" ? <p className="text-center text-sm text-muted-foreground">{t.aiError}</p> : null}

      {check.passed ? (
        <Button size="lg" autoFocus onClick={() => onContinue(feedback)}>
          {uz.review.next}
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onSkip(feedback)}>
            {t.skip}
          </Button>
          <Button autoFocus onClick={onRetry}>
            <RotateCcw aria-hidden />
            {t.tryAgain}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- written ---------------------------------------------------------

export function WritingTask({
  item,
  contextId,
  aiEnabled,
  onDone,
}: {
  item: TaskItem;
  contextId: string;
  aiEnabled: boolean;
  onDone: (r: ProductionResult) => void;
}) {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<ProductionCheck | null>(null);
  const [startedAt] = useState(() => Date.now());
  const live = checkProduction(text, item.english);
  const ai = useAiFeedback();

  const finish = (passed: boolean, feedback: AiFeedback | null) =>
    onDone({ passed, text, durationMs: Date.now() - startedAt, feedback });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border bg-card px-5 py-6 text-center shadow-(--shadow-lift)">
        <p className="font-display text-3xl font-semibold" lang="en">
          {item.english}
        </p>
        <p className="mt-1 text-muted-foreground">{item.uzbek}</p>
        <p className="mt-4 text-sm font-semibold">{productionPrompt(item.english, contextId, "written")}</p>
      </div>

      <Textarea
        autoFocus
        rows={4}
        lang="en"
        spellCheck
        value={text}
        readOnly={checked !== null}
        onChange={(e) => setText(e.target.value)}
        placeholder={uz.production.placeholder}
        aria-label={uz.production.writeTitle}
        className="text-lg"
      />
      <Requirements check={live} />

      {checked ? (
        <Outcome
          check={checked}
          term={item.english}
          aiEnabled={aiEnabled}
          aiRequest={() =>
            ai.mutateAsync({
              text,
              english: item.english,
              uzbek: item.uzbek,
              context: contextId,
              mode: "written",
            })
          }
          onContinue={(fb) => finish(true, fb)}
          onSkip={(fb) => finish(false, fb)}
          onRetry={() => setChecked(null)}
        />
      ) : (
        <Button
          size="lg"
          disabled={!text.trim()}
          onClick={() => setChecked(checkProduction(text, item.english))}
        >
          {uz.production.check}
        </Button>
      )}
    </div>
  );
}

// ---------- spoken ----------------------------------------------------------

function useRecorder() {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<SttError | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const listener = useRef<Listener | null>(null);
  const started = useRef(0);

  useEffect(() => () => listener.current?.abort(), []);

  function start() {
    setText("");
    setError(null);
    started.current = Date.now();
    setRecording(true);
    listener.current = listen({
      onText: setText,
      onEnd: (final, err) => {
        setRecording(false);
        setDurationMs(Date.now() - started.current);
        if (err) setError(err);
        setText(final);
      },
    });
  }

  return { text, setText, recording, error, durationMs, start, stop: () => listener.current?.stop() };
}

function MicButton({
  recording,
  onStart,
  onStop,
}: {
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const t = uz.production;
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={recording ? onStop : onStart}
        aria-label={recording ? t.stop : t.record}
        className={cn(
          "relative grid size-20 place-items-center rounded-full text-primary-foreground shadow-(--shadow-lift) outline-none focus-visible:ring-4 focus-visible:ring-ring/40 active:scale-95",
          recording ? "bg-destructive" : "bg-primary",
        )}
      >
        {recording ? (
          <>
            <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" aria-hidden />
            <Square className="relative size-7 fill-current" aria-hidden />
          </>
        ) : (
          <Mic className="size-8" aria-hidden />
        )}
      </button>
      <span className="text-sm font-semibold text-muted-foreground" aria-live="polite">
        {recording ? t.listening : t.record}
      </span>
    </div>
  );
}

function sttMessage(e: SttError | null): string | null {
  if (e === "not-allowed") return uz.production.sttDenied;
  if (e === "no-speech") return uz.production.sttNoSpeech;
  if (e === "unsupported") return uz.production.sttUnsupported;
  return null;
}

export function SpeakingTask({
  item,
  contextId,
  aiEnabled,
  onDone,
}: {
  item: TaskItem;
  contextId: string;
  aiEnabled: boolean;
  onDone: (r: ProductionResult) => void;
}) {
  const t = uz.production;
  const rec = useRecorder();
  const [supported] = useState(() => canRecognize());
  const typed = !supported || rec.error === "not-allowed";
  const [saidAloud, setSaidAloud] = useState(false);
  const [checked, setChecked] = useState<ProductionCheck | null>(null);
  const ai = useAiFeedback();

  const live = checkProduction(rec.text, item.english);
  const canCheck = rec.text.trim() && !rec.recording && (!typed || saidAloud);
  const finish = (passed: boolean, feedback: AiFeedback | null) =>
    onDone({ passed, text: rec.text, durationMs: rec.durationMs || null, feedback });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border bg-card px-5 py-6 text-center shadow-(--shadow-lift)">
        <p className="font-display text-3xl font-semibold" lang="en">
          {item.english}
        </p>
        <p className="mt-1 text-muted-foreground">{item.uzbek}</p>
        <p className="mt-4 text-sm font-semibold">{productionPrompt(item.english, contextId, "spoken")}</p>
      </div>

      {typed ? (
        <>
          <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            <MicOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            {sttMessage(supported ? rec.error : "unsupported")}
          </p>
          <Textarea
            rows={3}
            lang="en"
            value={rec.text}
            readOnly={checked !== null}
            onChange={(e) => rec.setText(e.target.value)}
            placeholder={t.placeholder}
            aria-label={t.speakTitle}
          />
          <Checkbox
            label={t.saidAloud}
            checked={saidAloud}
            onChange={(e) => setSaidAloud(e.target.checked)}
          />
        </>
      ) : checked ? null : (
        <>
          <MicButton recording={rec.recording} onStart={rec.start} onStop={rec.stop} />
          {sttMessage(rec.error) ? (
            <p className="text-center text-sm text-destructive">{sttMessage(rec.error)}</p>
          ) : null}
        </>
      )}

      {!typed && rec.text ? (
        <div className="rounded-xl border bg-card px-4 py-3" aria-live="polite">
          <p className="text-xs font-semibold text-muted-foreground">{t.transcript}</p>
          <p className="mt-1 text-lg" lang="en">
            {rec.text}
          </p>
        </div>
      ) : null}
      {rec.text ? <Requirements check={live} /> : null}

      {checked ? (
        <Outcome
          check={checked}
          term={item.english}
          aiEnabled={aiEnabled}
          aiRequest={() =>
            ai.mutateAsync({
              text: rec.text,
              english: item.english,
              uzbek: item.uzbek,
              context: contextId,
              mode: "spoken",
            })
          }
          onContinue={(fb) => finish(true, fb)}
          onSkip={(fb) => finish(false, fb)}
          onRetry={() => {
            setChecked(null);
            if (!typed) rec.setText("");
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            disabled={!canCheck}
            onClick={() => setChecked(checkProduction(rec.text, item.english))}
          >
            {t.check}
          </Button>
          {!typed && rec.text && !rec.recording ? (
            <Button variant="ghost" onClick={rec.start}>
              <RotateCcw aria-hidden />
              {t.redo}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------- shadowing -------------------------------------------------------

export const SHADOW_PASS = 0.75;

export function ShadowingTask({
  sentence,
  translation,
  speech,
  onDone,
}: {
  sentence: string;
  translation?: string | null;
  speech: SpeechPrefs;
  onDone: (r: ProductionResult & { similarity: number }) => void;
}) {
  const t = uz.production;
  const rec = useRecorder();
  const [supported] = useState(() => canRecognize());
  const done = rec.text && !rec.recording;
  const similarity = done ? wordSimilarity(rec.text, sentence) : null;
  const passed = similarity !== null && similarity >= SHADOW_PASS;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border bg-card px-5 py-6 text-center shadow-(--shadow-lift)">
        <p className="font-display text-2xl leading-snug font-semibold" lang="en">
          {sentence}
        </p>
        {translation ? <p className="mt-2 text-sm text-muted-foreground">{translation}</p> : null}
        <div className="mt-4">
          <SpeakButton text={sentence} prefs={speech} autoPlay />
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground">{t.shadowHint}</p>

      {supported ? (
        <MicButton recording={rec.recording} onStart={rec.start} onStop={rec.stop} />
      ) : (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">{t.sttUnsupported}</p>
      )}
      {sttMessage(rec.error) && supported ? (
        <p className="text-center text-sm text-destructive">{sttMessage(rec.error)}</p>
      ) : null}

      {done && similarity !== null ? (
        <>
          <div
            role="status"
            className={cn(
              "rounded-xl border px-4 py-3",
              passed
                ? "border-success/30 bg-success-soft text-success"
                : "border-warning/30 bg-warning-soft text-warning",
            )}
          >
            <p className="font-semibold">
              {passed ? t.shadowPassed : t.shadowRetry} · {t.similarity(Math.round(similarity * 100))}
            </p>
            <p className="mt-1 text-sm text-foreground" lang="en">
              <span className="text-muted-foreground">{t.transcript}</span> {rec.text}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={rec.start}>
              <RotateCcw aria-hidden />
              {t.redo}
            </Button>
            <Button
              autoFocus
              onClick={() =>
                onDone({
                  passed,
                  text: rec.text,
                  durationMs: rec.durationMs || null,
                  feedback: null,
                  similarity,
                })
              }
            >
              {uz.review.next}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
