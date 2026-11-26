"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Circle,
  Eye,
  Languages,
  Loader2,
  Mic,
  RotateCcw,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { Notice, Textarea } from "@/components/ui/form-controls";
import { sttError, useLongRecorder } from "@/hooks/use-long-recorder";
import { ACTIVE_DAYS, spokenDays } from "@/lib/production/active";
import { fetchSpokenUses, saveProductions, type ProductionWrite } from "@/lib/production/api";
import {
  fetchStories,
  fetchStory,
  fetchWeekCandidates,
  saveStoryProgress,
  type StoryRow,
  type StorySummary,
} from "@/lib/story/api";
import { fetchRetell, generateStory } from "@/lib/story/client";
import {
  DEFAULT_STORY_LEVEL,
  highlightWords,
  checkPart,
  maskPart,
  MASK_STEPS,
  missingWords,
  offlineRetellScore,
  parseStory,
  parseStoryWords,
  PEEK_MS,
  pickStoryWords,
  RETELL_MAX_SECONDS,
  RETELL_MIN_WORDS,
  retellLongEnough,
  retellWordsUsed,
  STORY_CONTEXT,
  STORY_LEVELS,
  STORY_MIN_WORDS,
  storyLevel,
  storyText,
  weekEnd,
  type Retell,
  type StoryBody,
  type StoryWord,
} from "@/lib/story/story";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { StoryLevelId } from "@/lib/supabase/database.types";
import type { IsoDate } from "@/lib/srs/dates";
import { usesTerm } from "@/lib/text/usage";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { SpokenAnswerInput, useSpokenAnswer } from "../nutq/speaking-shared";

const sb = () => getSupabaseBrowserClient();
const t = uz.story;
const LEVEL_KEY = "ll.story.level";

function useStoryLevel() {
  const [level, setLevel] = useState<StoryLevelId>(() => {
    if (typeof window === "undefined") return DEFAULT_STORY_LEVEL;
    try {
      const saved = window.localStorage.getItem(LEVEL_KEY);
      return STORY_LEVELS.some((l) => l.id === saved) ? (saved as StoryLevelId) : DEFAULT_STORY_LEVEL;
    } catch {
      return DEFAULT_STORY_LEVEL;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(LEVEL_KEY, level);
    } catch {
      // storage off: the level is only kept for this visit
    }
  }, [level]);
  return [level, setLevel] as const;
}

export function StoryClient({
  weekStart,
  current,
  opensIn,
  from,
  to,
  aiEnabled,
  speech,
}: {
  weekStart: IsoDate;
  current: boolean;
  opensIn: number;
  from: string;
  to: string;
  aiEnabled: boolean;
  speech: SpeechPrefs;
}) {
  const [level, setLevel] = useStoryLevel();
  const [selected, setSelected] = useState<{ weekStart: IsoDate; level: StoryLevelId }>({ weekStart, level });
  const viewing = selected.weekStart === weekStart ? { weekStart, level } : selected;

  const stories = useQuery({ queryKey: ["stories"], queryFn: () => fetchStories(sb()) });
  const story = useQuery({
    queryKey: ["story", viewing.weekStart, viewing.level],
    queryFn: () => fetchStory(sb(), viewing.weekStart, viewing.level),
  });
  const archive = (stories.data ?? []).filter(
    (s) => !(s.week_start === viewing.weekStart && s.level === viewing.level),
  );

  return (
    <div className="flex flex-col gap-5">
      {current ? null : opensIn > 0 ? (
        <Notice tone="neutral" icon={Sparkles}>
          {t.opensIn(opensIn)}
        </Notice>
      ) : null}

      <WeekHeader
        weekStart={viewing.weekStart}
        label={viewing.weekStart === weekStart ? (current ? t.thisWeek : t.lastWeek) : null}
        onBack={viewing.weekStart !== weekStart ? () => setSelected({ weekStart, level }) : undefined}
      />

      {viewing.weekStart === weekStart ? (
        <LevelPicker
          value={level}
          onChange={(l) => {
            setLevel(l);
            setSelected({ weekStart, level: l });
          }}
        />
      ) : null}

      {story.isPending ? (
        <div className="h-64 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />
      ) : story.isError ? (
        <EmptyState
          icon={AlertTriangle}
          title={uz.common.errorTitle}
          description={uz.common.errorBody}
          action={<Button onClick={() => story.refetch()}>{uz.common.retry}</Button>}
        />
      ) : story.data ? (
        <StoryView key={story.data.id} row={story.data} speech={speech} aiEnabled={aiEnabled} />
      ) : viewing.weekStart === weekStart ? (
        <Generator weekStart={weekStart} level={level} from={from} to={to} aiEnabled={aiEnabled} />
      ) : null}

      {archive.length ? (
        <Archive stories={archive} onOpen={(s) => setSelected({ weekStart: s.week_start, level: s.level })} />
      ) : null}
    </div>
  );
}

function WeekHeader({
  weekStart,
  label,
  onBack,
}: {
  weekStart: IsoDate;
  label: string | null;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        {label ? (
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{label}</p>
        ) : null}
        <p className="font-display text-lg font-semibold tabular-nums">
          {t.weekOf(weekStart, weekEnd(weekStart))}
        </p>
      </div>
      {onBack ? (
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden />
          {t.thisWeek}
        </Button>
      ) : null}
    </div>
  );
}

function LevelPicker({ value, onChange }: { value: StoryLevelId; onChange: (l: StoryLevelId) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {t.level}
      </p>
      <div role="radiogroup" aria-label={t.level} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {STORY_LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={l.id === value}
            onClick={() => onChange(l.id)}
            className={cn(
              "flex h-12 flex-col items-center justify-center rounded-lg border px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              l.id === value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary/40",
            )}
          >
            {l.label}
            <span className="text-[10px] font-medium opacity-75">{l.cefr}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- making the week's story ------------------------------------------------------

function Generator({
  weekStart,
  level,
  from,
  to,
  aiEnabled,
}: {
  weekStart: IsoDate;
  level: StoryLevelId;
  from: string;
  to: string;
  aiEnabled: boolean;
}) {
  const qc = useQueryClient();
  const candidates = useQuery({
    queryKey: ["story-candidates", from, to],
    queryFn: () => fetchWeekCandidates(sb(), from, to),
  });
  const uses = useQuery({ queryKey: ["spoken-uses"], queryFn: () => fetchSpokenUses(sb()) });
  const words = useMemo(
    () =>
      pickStoryWords(
        candidates.data ?? [],
        spokenDays(uses.data ?? []),
        ACTIVE_DAYS,
        storyLevel(level).maxWords,
      ),
    [candidates.data, uses.data, level],
  );
  const make = useMutation({
    mutationFn: () => generateStory({ weekStart, level, words }),
    onSuccess: (row) => {
      qc.setQueryData(["story", weekStart, level], row);
      void qc.invalidateQueries({ queryKey: ["stories"] });
    },
  });

  if (candidates.isPending || uses.isPending) {
    return <div className="h-40 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />;
  }
  if (candidates.isError) {
    return <EmptyState icon={AlertTriangle} title={uz.common.errorTitle} description={uz.common.errorBody} />;
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
      <div>
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {t.weekWords(words.length)}
        </p>
        {words.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {words.map((w) => (
              <li
                key={w.id}
                title={w.uzbek}
                className="rounded-full border bg-background px-3 py-1 text-sm font-semibold"
              >
                <span lang="en">{w.english}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">{t.weekWordsBody}</p>
      </div>

      {words.length < STORY_MIN_WORDS ? (
        <Notice tone="warning" icon={AlertTriangle}>
          {t.tooFew(STORY_MIN_WORDS)}
        </Notice>
      ) : !aiEnabled ? (
        <Notice tone="warning" icon={AlertTriangle}>
          {t.needsAi}
        </Notice>
      ) : (
        <>
          {make.isError ? (
            <Notice tone="danger" icon={AlertTriangle}>
              {t.generateError}
            </Notice>
          ) : null}
          <Button size="lg" onClick={() => make.mutate()} disabled={make.isPending}>
            {make.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {make.isPending ? t.generating : t.generate}
          </Button>
        </>
      )}
    </section>
  );
}

function Archive({ stories, onOpen }: { stories: StorySummary[]; onOpen: (s: StorySummary) => void }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{t.archive}</h2>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-(--shadow-soft)">
        {stories.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onOpen(s)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-sunken focus-visible:bg-sunken"
            >
              <BookOpenText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold" lang="en">
                  {s.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t.weekOf(s.week_start, weekEnd(s.week_start))} · {storyLevel(s.level).label}
                  {s.best_retell !== null ? ` · ${t.retoldScore(s.best_retell)}` : ""}
                </span>
              </span>
              {s.retold_at ? <CheckCircle2 className="size-5 text-success" aria-hidden /> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- the story: read → memorize → retell ---------------------------------------------

type Step = "read" | "memorize" | "retell";

function StoryView({ row, speech, aiEnabled }: { row: StoryRow; speech: SpeechPrefs; aiEnabled: boolean }) {
  const body = useMemo(() => parseStory(row.story), [row.story]);
  const words = useMemo(() => parseStoryWords(row.words), [row.words]);
  const [step, setStep] = useState<Step>(row.memorized_parts > 0 ? "memorize" : "read");

  if (!body) {
    return <EmptyState icon={AlertTriangle} title={uz.common.errorTitle} description={uz.common.errorBody} />;
  }
  const missing = missingWords(body, words);

  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {storyLevel(row.level).label} · {storyLevel(row.level).cefr}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold" lang="en">
          {row.title}
        </h2>
        {body.title_uz ? (
          <p className="text-sm text-muted-foreground" lang="uz">
            {body.title_uz}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          {t.memorized(Math.min(row.memorized_parts, body.parts.length), body.parts.length)}
          {row.best_retell !== null ? ` · ${t.retoldScore(row.best_retell)}` : ""}
        </p>
        {missing.length ? (
          <p className="mt-2 text-xs text-warning">
            {t.missingWords} {missing.map((w) => w.english).join(", ")}
          </p>
        ) : null}
      </header>

      <div role="tablist" className="grid grid-cols-3 gap-1.5">
        {(
          [
            ["read", t.stepRead],
            ["memorize", t.stepMemorize],
            ["retell", t.stepRetell],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={step === key}
            onClick={() => setStep(key)}
            className={cn(
              "h-10 rounded-lg border px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              step === key
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary/40",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {step === "read" ? (
        <ReadStep body={body} words={words} speech={speech} onNext={() => setStep("memorize")} />
      ) : step === "memorize" ? (
        <MemorizeStep row={row} body={body} words={words} speech={speech} onNext={() => setStep("retell")} />
      ) : (
        <RetellStep row={row} body={body} words={words} aiEnabled={aiEnabled} />
      )}
    </div>
  );
}

function Highlighted({ text, words }: { text: string; words: StoryWord[] }) {
  return (
    <>
      {highlightWords(text, words).map((seg, i) =>
        seg.word ? (
          <mark
            key={i}
            title={seg.word.uzbek}
            className="rounded bg-highlight-soft px-0.5 font-semibold text-highlight-foreground"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

function ReadStep({
  body,
  words,
  speech,
  onNext,
}: {
  body: StoryBody;
  words: StoryWord[];
  speech: SpeechPrefs;
  onNext: () => void;
}) {
  const [showUz, setShowUz] = useState(false);
  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t.readHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <SpeakButton text={storyText(body)} prefs={speech} />
        <Button variant="ghost" size="sm" onClick={() => setShowUz(!showUz)} aria-pressed={showUz}>
          <Languages aria-hidden />
          {showUz ? t.hideUz : t.showUz}
        </Button>
      </div>
      <ol className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-(--shadow-soft)">
        {body.parts.map((p, i) => (
          <li key={i}>
            <p className="text-lg leading-relaxed" lang="en">
              <Highlighted text={p.en} words={words} />
            </p>
            {showUz ? (
              <p className="mt-1 text-sm text-muted-foreground" lang="uz">
                {p.uz}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      <Button size="lg" onClick={onNext}>
        {t.toMemorize}
        <ArrowRight aria-hidden />
      </Button>
    </section>
  );
}

function MemorizeStep({
  row,
  body,
  words,
  speech,
  onNext,
}: {
  row: StoryRow;
  body: StoryBody;
  words: StoryWord[];
  speech: SpeechPrefs;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const total = body.parts.length;
  // Parts before memorized_parts were learned earlier (also on another device).
  const [done, setDone] = useState(() => Math.min(row.memorized_parts, total));
  const [index, setIndex] = useState(() => Math.min(row.memorized_parts, total - 1));
  const [maskStep, setMaskStep] = useState(0);
  const [peek, setPeek] = useState(false);
  // Peeked at the hidden text since the last answer: that answer does not move the part on.
  const [peeked, setPeeked] = useState(false);
  const answer = useSpokenAnswer();
  const part = body.parts[index]!;
  const targets = useMemo(() => words.map((w) => w.english), [words]);
  const check = answer.answer ? checkPart(answer.answer, part.en, targets) : null;
  const lookedAt = peeked && maskStep > 0;
  const passed = Boolean(check?.passed) && !lookedAt;

  // A peek is short, and ends as soon as the learner starts speaking.
  useEffect(() => {
    if (!peek) return;
    const id = setTimeout(() => setPeek(false), PEEK_MS);
    return () => clearTimeout(id);
  }, [peek]);
  // Hidden again as soon as the learner starts speaking.
  const showing = peek && !answer.rec.recording;

  function retry() {
    setPeeked(false);
    setPeek(false);
    answer.reset();
  }
  const partDone = index < done;

  function go(i: number) {
    setIndex(i);
    setMaskStep(0);
    setPeek(false);
    setPeeked(false);
    answer.reset();
  }

  function advance() {
    if (!passed) return;
    if (maskStep + 1 < MASK_STEPS) {
      setMaskStep(maskStep + 1);
      setPeek(false);
      setPeeked(false);
      answer.reset();
      return;
    }
    // The last (no text) step passed: this part is memorized.
    const nextDone = Math.max(done, index + 1);
    setDone(nextDone);
    void saveStoryProgress(sb(), row, { memorizedParts: nextDone })
      .then(() => qc.invalidateQueries({ queryKey: ["stories"] }))
      .catch(() => undefined);
    if (index + 1 < total) go(index + 1);
    else answer.reset();
  }

  const allDone = done >= total;
  const shown = showing ? part.en : maskPart(part.en, maskStep, targets);

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t.memorizeHint}</p>

      <ol className="flex gap-1" aria-label={t.stepMemorize}>
        {body.parts.map((_, i) => (
          <li key={i} className="flex-1">
            <button
              type="button"
              onClick={() => go(i)}
              aria-label={t.part(i + 1, total)}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "h-2 w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                i < done ? "bg-success" : i === index ? "bg-primary" : "bg-sunken",
              )}
            />
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {t.part(index + 1, total)}
          </p>
          <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {t.maskStep[maskStep]}
          </span>
        </div>
        {shown ? (
          <p className="mt-3 font-mono text-lg leading-relaxed tracking-tight" lang="en">
            {showing || maskStep === 0 ? <Highlighted text={shown} words={words} /> : shown}
          </p>
        ) : null}
        <p className={cn("text-sm text-muted-foreground", shown && "mt-2")} lang="uz">
          {part.uz}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SpeakButton key={part.en} text={part.en} prefs={speech} autoPlay={maskStep === 0} />
          {maskStep > 0 && !showing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeek(true);
                setPeeked(true);
              }}
            >
              <Eye aria-hidden />
              {t.showText}
            </Button>
          ) : null}
        </div>
      </div>

      {partDone && maskStep === 0 && !answer.answer ? (
        <p className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          {t.partDone}
        </p>
      ) : null}

      {!answer.answer ? (
        <SpokenAnswerInput state={answer} />
      ) : (
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
            {passed
              ? t.partPassed
              : check?.passed && lookedAt
                ? t.peekedRetry
                : check?.missing.length
                  ? t.partWordMissing(check.missing.join(", "))
                  : t.partRetry(Math.round((check?.similarity ?? 0) * 100))}
          </p>
          <p className="mt-1 text-sm text-foreground" lang="en">
            <span className="text-muted-foreground">{uz.production.transcript}</span> {answer.answer}
          </p>
        </div>
      )}

      {answer.answer ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={retry} autoFocus={!passed}>
            <RotateCcw aria-hidden />
            {uz.production.redo}
          </Button>
          <Button onClick={advance} disabled={!passed} autoFocus={passed}>
            {maskStep + 1 < MASK_STEPS
              ? t.maskStep[maskStep + 1]
              : index + 1 < total
                ? t.nextPart
                : t.partDone}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={() => go(index - 1)} disabled={index === 0}>
            <ArrowLeft aria-hidden />
            {t.prevPart}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go(index + 1)} disabled={index + 1 >= total}>
            {t.nextPart}
            <ArrowRight aria-hidden />
          </Button>
        </div>
      )}

      {allDone ? (
        <Notice tone="success" icon={CheckCircle2}>
          <div className="flex flex-1 flex-col gap-2">
            {t.allMemorized}
            <Button size="sm" onClick={onNext}>
              {t.toRetell}
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </Notice>
      ) : null}
    </section>
  );
}

// ---------- retelling ---------------------------------------------------------------------------

interface RetellResult {
  score: number;
  retell: Retell | null;
  used: Set<string>;
  transcript: string;
  rows: ProductionWrite[];
  saved: boolean;
}

function RetellStep({
  row,
  body,
  words,
  aiEnabled,
}: {
  row: StoryRow;
  body: StoryBody;
  words: StoryWord[];
  aiEnabled: boolean;
}) {
  const qc = useQueryClient();
  const rec = useLongRecorder(RETELL_MAX_SECONDS);
  const [typed, setTyped] = useState("");
  const transcript = rec.supported ? rec.text : typed;
  const [phase, setPhase] = useState<"talk" | "checking" | "result">("talk");
  const [short, setShort] = useState(false);
  const [result, setResult] = useState<RetellResult | null>(null);
  const heard = useMemo(
    () => new Set(words.filter((w) => usesTerm(transcript, w.english)).map((w) => w.id)),
    [words, transcript],
  );

  const save = useMutation({
    mutationFn: async (v: { rows: ProductionWrite[]; score: number }) => {
      await saveProductions(sb(), v.rows);
      await saveStoryProgress(sb(), row, { retell: v.score });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["spoken-uses"] });
      void qc.invalidateQueries({ queryKey: ["stories"] });
      void qc.invalidateQueries({ queryKey: ["story", row.week_start, row.level] });
    },
  });

  async function check() {
    const said = transcript.trim();
    if (!retellLongEnough(said)) {
      setShort(true);
      return;
    }
    setShort(false);
    setPhase("checking");
    const story = storyText(body);
    const retell = aiEnabled
      ? await fetchRetell({
          level: `${storyLevel(row.level).label} (${storyLevel(row.level).cefr})`,
          title: row.title,
          story: story.slice(0, 4000),
          outline: body.outline_uz,
          words: words.map((w) => ({ english: w.english, uzbek: w.uzbek })),
          said: said.slice(0, 6000),
        })
      : null;
    const used = retellWordsUsed(said, words, retell);
    const score = retell?.score ?? offlineRetellScore(said, story, words);
    const drillId = crypto.randomUUID();
    const rows: ProductionWrite[] = words
      .filter((w) => usesTerm(said, w.english))
      .map((w) => ({
        clientId: crypto.randomUUID(),
        itemId: w.id,
        mode: rec.supported ? "spoken" : "written",
        exercise: "drill",
        drillId,
        context: STORY_CONTEXT,
        prompt: row.title,
        text: said,
        passed: used.has(w.id),
        durationMs: rec.supported ? rec.seconds * 1000 : null,
      }));
    const saved = await save.mutateAsync({ rows, score }).then(
      () => true,
      () => false,
    );
    setResult({ score, retell, used, transcript: said, rows, saved });
    setPhase("result");
  }

  function again() {
    rec.reset();
    setTyped("");
    setResult(null);
    setShort(false);
    setPhase("talk");
  }

  if (phase === "result" && result) {
    return (
      <RetellResultView
        result={result}
        body={body}
        words={words}
        saving={save.isPending}
        onRetrySave={() =>
          void save.mutateAsync({ rows: result.rows, score: result.score }).then(
            () => setResult({ ...result, saved: true }),
            () => undefined,
          )
        }
        onAgain={again}
      />
    );
  }

  const talking = rec.recording;
  const hasTalk = transcript.trim().length > 0;

  return (
    <section className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t.retellIntro}</p>

      <div className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t.outline}</p>
        <ol className="mt-2 list-decimal pl-5 text-sm leading-relaxed" lang="uz">
          {body.outline_uz.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        <p className="mt-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {t.words}
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-live="polite">
          {words.map((w) => {
            const used = heard.has(w.id);
            return (
              <li
                key={w.id}
                title={w.uzbek}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold transition-colors",
                  used ? "border-success/40 bg-success-soft text-success" : "bg-background",
                )}
              >
                {used ? (
                  <CheckCircle2 className="size-3.5" aria-hidden />
                ) : (
                  <Circle className="size-3.5 text-muted-foreground" aria-hidden />
                )}
                <span lang="en">{w.english}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {rec.supported ? (
        <div className="flex flex-col items-center gap-3">
          {talking || hasTalk ? (
            <p
              className="flex items-center gap-2 font-display text-3xl font-semibold tabular-nums"
              role="timer"
            >
              {talking ? (
                <span className="size-3 animate-pulse rounded-full bg-destructive" aria-hidden />
              ) : null}
              {t.time(rec.seconds)}
            </p>
          ) : null}
          {hasTalk ? (
            <p
              className="max-h-60 w-full overflow-y-auto rounded-xl border bg-card px-4 py-3 text-lg"
              lang="en"
              aria-live="polite"
            >
              {transcript}
            </p>
          ) : talking ? (
            <p className="w-full rounded-xl border bg-card px-4 py-3 text-lg text-muted-foreground">
              {uz.production.listening}
            </p>
          ) : null}
          {sttError(rec.error) ? (
            <p className="text-center text-sm text-destructive">{sttError(rec.error)}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t.typeInstead}</p>
          <Textarea rows={8} lang="en" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}

      {short ? (
        <Notice tone="warning" icon={AlertTriangle}>
          {t.tooShort(RETELL_MIN_WORDS)}
        </Notice>
      ) : null}

      {phase === "checking" ? (
        <Button size="lg" disabled>
          <Loader2 className="animate-spin" aria-hidden />
          {t.checking}
        </Button>
      ) : talking ? (
        <Button size="lg" variant="destructive" onClick={rec.stop}>
          <Square className="fill-current" aria-hidden />
          {t.stop}
        </Button>
      ) : rec.supported && !hasTalk ? (
        <Button size="lg" onClick={rec.start}>
          <Mic aria-hidden />
          {t.start}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => void check()} disabled={!hasTalk}>
            <CheckCircle2 aria-hidden />
            {t.check}
          </Button>
          {rec.supported ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={rec.start} disabled={rec.seconds >= RETELL_MAX_SECONDS}>
                <Mic aria-hidden />
                {t.resume}
              </Button>
              <Button variant="ghost" onClick={rec.reset}>
                <RotateCcw aria-hidden />
                {t.restart}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function RetellResultView({
  result,
  body,
  words,
  saving,
  onRetrySave,
  onAgain,
}: {
  result: RetellResult;
  body: StoryBody;
  words: StoryWord[];
  saving: boolean;
  onRetrySave: () => void;
  onAgain: () => void;
}) {
  const { retell, score, used } = result;
  const points = retell?.points ?? [];
  const covered = points.filter(Boolean).length;
  return (
    <div className="animate-rise flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {t.scoreLabel}
        </p>
        <p
          className={cn(
            "mt-1 font-display text-4xl font-semibold tabular-nums",
            score >= 75 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive",
          )}
        >
          {t.score(score)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {retell ? `${t.pointsCovered(covered, body.outline_uz.length)} · ` : ""}
          {t.wordsUsed(used.size, words.length)}
        </p>
        {retell ? (
          <ol className="mt-3 flex flex-col gap-1 text-sm" lang="uz">
            {body.outline_uz.map((p, i) => (
              <li key={p} className="flex items-start gap-2">
                {points[i] ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className={cn(!points[i] && "text-muted-foreground")}>{p}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {words.map((w) => (
            <li
              key={w.id}
              title={w.uzbek}
              className={cn(
                "rounded-full border px-2.5 py-1 text-sm font-semibold",
                used.has(w.id) ? "border-success/40 bg-success-soft text-success" : "text-muted-foreground",
              )}
              lang="en"
            >
              {w.english}
            </li>
          ))}
        </ul>
        {retell?.feedback_uz ? <p className="mt-4 text-sm">{retell.feedback_uz}</p> : null}
        {!retell ? <p className="mt-3 text-xs text-muted-foreground">{t.offlineNote}</p> : null}
        {result.saved && used.size ? <p className="mt-3 text-xs text-success">{t.saved}</p> : null}
      </section>

      {retell?.fixes.length ? (
        <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-soft)">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            <Wrench className="size-3.5" aria-hidden />
            {t.fixes}
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {retell.fixes.map((f, i) => (
              <li key={i}>
                <p className="text-sm text-destructive line-through decoration-destructive/40" lang="en">
                  {f.said}
                </p>
                <p className="font-semibold" lang="en">
                  {f.better}
                </p>
                <p className="text-sm text-muted-foreground">{f.explanation_uz}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="rounded-xl border bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold">{t.transcript}</summary>
        <p className="mt-2 text-sm" lang="en">
          {result.transcript}
        </p>
      </details>

      {!result.saved ? (
        <Notice tone="danger" icon={AlertTriangle}>
          <div className="flex flex-1 flex-col gap-2">
            {t.saveFailed}
            <Button size="sm" variant="outline" onClick={onRetrySave} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden /> : <RotateCcw aria-hidden />}
              {t.retry}
            </Button>
          </div>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onAgain}>
          <Mic aria-hidden />
          {t.again}
        </Button>
        <Button asChild variant="outline">
          <Link href="/bugun">{uz.recap.backToday}</Link>
        </Button>
      </div>
    </div>
  );
}
