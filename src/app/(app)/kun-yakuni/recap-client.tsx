"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Lightbulb,
  Loader2,
  Mic,
  Plus,
  RotateCcw,
  Shuffle,
  Square,
  Wrench,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Notice, Textarea } from "@/components/ui/form-controls";
import { addItems } from "@/lib/items/api";
import { saveProductions, type ProductionWrite } from "@/lib/production/api";
import { itemInputSchema } from "@/lib/schemas/item";
import { fetchRecap } from "@/lib/speaking/client";
import {
  confirmedUses,
  findLibraryUses,
  pickRecapHints,
  recapCounts,
  recapTopic,
  RECAP_CONTEXT,
  RECAP_MAX_CANDIDATES,
  RECAP_MAX_SECONDS,
  RECAP_MIN_SECONDS,
  RECAP_MIN_TYPED_WORDS,
  RECAP_MIN_WORDS,
  RECAP_TARGET_SECONDS,
  type Recap,
} from "@/lib/speaking/recap";
import {
  fetchRecapLibrary,
  fetchRecapRows,
  fetchReviewedTodayIds,
  type RecapLibraryWord,
} from "@/lib/speaking/recap-api";
import { sttError, useLongRecorder } from "@/hooks/use-long-recorder";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { IsoDate } from "@/lib/srs/dates";
import { usesTerm } from "@/lib/text/usage";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const sb = () => getSupabaseBrowserClient();
const t = uz.recap;

export function RecapClient({
  today,
  dayStart,
  aiEnabled,
}: {
  today: IsoDate;
  dayStart: string;
  aiEnabled: boolean;
}) {
  const library = useQuery({ queryKey: ["recap-library"], queryFn: () => fetchRecapLibrary(sb()) });
  const reviewed = useQuery({
    queryKey: ["recap-reviewed", dayStart],
    queryFn: () => fetchReviewedTodayIds(sb(), dayStart),
  });
  const rows = useQuery({
    queryKey: ["recap-rows", dayStart],
    queryFn: () => fetchRecapRows(sb(), dayStart),
  });

  if (library.isPending || reviewed.isPending) {
    return (
      <div className="grid place-items-center py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }
  if (library.isError || reviewed.isError) {
    return <EmptyState icon={AlertTriangle} title={uz.common.errorTitle} description={uz.common.errorBody} />;
  }
  if (library.data.length === 0) {
    return <EmptyState icon={Mic} title={t.emptyTitle} description={t.emptyBody} />;
  }
  return (
    <RecapSession
      library={library.data}
      reviewedIds={reviewed.data}
      today={today}
      aiEnabled={aiEnabled}
      doneToday={(rows.data?.length ?? 0) > 0}
    />
  );
}

// ---------- the recap ---------------------------------------------------------

interface Result {
  found: RecapLibraryWord[];
  confirmed: Set<string>;
  recap: Recap | null;
  transcript: string;
  rows: ProductionWrite[];
  saved: boolean;
}

/** Most common CEFR level of the library: the level the AI should expect. */
function libraryLevel(library: RecapLibraryWord[]): string | undefined {
  const count = new Map<string, number>();
  for (const w of library) if (w.cefr_level) count.set(w.cefr_level, (count.get(w.cefr_level) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function RecapSession({
  library,
  reviewedIds,
  today,
  aiEnabled,
  doneToday,
}: {
  library: RecapLibraryWord[];
  reviewedIds: Set<string>;
  today: IsoDate;
  aiEnabled: boolean;
  doneToday: boolean;
}) {
  const qc = useQueryClient();
  const [shift, setShift] = useState(0);
  const topic = recapTopic(today, shift);
  const [hints, setHints] = useState(() =>
    pickRecapHints(
      library.filter((w) => reviewedIds.has(w.id)),
      library,
      Math.random,
    ),
  );
  const rec = useLongRecorder(RECAP_MAX_SECONDS);
  const [typed, setTyped] = useState("");
  const transcript = rec.supported ? rec.text : typed;
  const [phase, setPhase] = useState<"talk" | "checking" | "result">("talk");
  const [short, setShort] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Only the hints are matched live (cheap); the whole library at the end.
  const hintUsed = useMemo(
    () => new Set(hints.filter((h) => usesTerm(transcript, h.english)).map((h) => h.id)),
    [hints, transcript],
  );

  const save = useMutation({
    mutationFn: (rows: ProductionWrite[]) => saveProductions(sb(), rows),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recap-rows"] });
      void qc.invalidateQueries({ queryKey: ["spoken-uses"] });
    },
  });

  async function check() {
    if (!recapCounts(rec.seconds, transcript, !rec.supported)) {
      setShort(true);
      return;
    }
    setShort(false);
    setPhase("checking");
    const said = transcript.trim();
    const found = findLibraryUses(said, library);
    const recap = aiEnabled
      ? await fetchRecap({
          said: said.slice(0, 4000),
          topic: topic.en,
          level: libraryLevel(library),
          candidates: found
            .slice(0, RECAP_MAX_CANDIDATES)
            .map((w) => ({ english: w.english, uzbek: w.uzbek })),
        })
      : null;
    const confirmed = confirmedUses(found, recap);
    const drillId = crypto.randomUUID();
    const foundIds = new Set(found.map((w) => w.id));
    const row = (itemId: string, passed: boolean): ProductionWrite => ({
      clientId: crypto.randomUUID(),
      itemId,
      mode: rec.supported ? "spoken" : "written",
      exercise: "drill",
      drillId,
      context: RECAP_CONTEXT,
      prompt: topic.en,
      text: said,
      passed,
      durationMs: rec.supported ? rec.seconds * 1000 : null,
    });
    const rows = [
      ...found.map((w) => row(w.id, confirmed.has(w.id))),
      ...hints.filter((h) => !foundIds.has(h.id)).map((h) => row(h.id, false)),
    ];
    const saved = await save.mutateAsync(rows).then(
      () => true,
      () => false,
    );
    setResult({ found, confirmed, recap, transcript: said, rows, saved });
    setPhase("result");
  }

  function again() {
    rec.reset();
    setTyped("");
    setResult(null);
    setShort(false);
    setShift((s) => s + 1);
    setHints(
      pickRecapHints(
        library.filter((w) => reviewedIds.has(w.id)),
        library,
        Math.random,
      ),
    );
    setPhase("talk");
  }

  if (phase === "result" && result) {
    return (
      <RecapResult
        result={result}
        hints={new Set(hints.map((h) => h.id))}
        aiEnabled={aiEnabled}
        saving={save.isPending}
        onRetrySave={() =>
          void save.mutateAsync(result.rows).then(
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
    <div className="flex flex-col gap-5">
      {doneToday ? (
        <Notice tone="success" icon={CheckCircle2}>
          {t.doneToday}
        </Notice>
      ) : null}

      <section className="bg-ruled rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t.topic}
            </p>
            <p className="mt-1 font-display text-xl leading-snug font-semibold">{topic.uz}</p>
            <p className="mt-1 text-sm text-muted-foreground" lang="en">
              {topic.en}
            </p>
          </div>
          {!talking && !hasTalk ? (
            <Button variant="ghost" size="sm" onClick={() => setShift((s) => s + 1)}>
              <Shuffle aria-hidden />
              {t.otherTopic}
            </Button>
          ) : null}
        </div>

        {hints.length ? (
          <>
            <p className="mt-5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {t.hints}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2" aria-live="polite">
              {hints.map((h) => {
                const used = hintUsed.has(h.id);
                return (
                  <li
                    key={h.id}
                    title={h.uzbek}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                      used ? "border-success/40 bg-success-soft text-success" : "bg-background",
                    )}
                  >
                    {used ? (
                      <CheckCircle2 className="size-4" aria-hidden />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" aria-hidden />
                    )}
                    <span lang="en">{h.english}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">{t.hintsBody}</p>
          </>
        ) : null}
      </section>

      {rec.supported ? (
        <div className="flex flex-col items-center gap-3">
          {talking || hasTalk ? (
            <div className="flex items-baseline gap-2 tabular-nums" role="timer">
              {talking ? (
                <span className="size-3 animate-pulse rounded-full bg-destructive" aria-hidden />
              ) : null}
              <span className="font-display text-3xl font-semibold">{t.time(rec.seconds)}</span>
              <span className="text-sm text-muted-foreground">{t.goal(RECAP_TARGET_SECONDS)}</span>
            </div>
          ) : null}
          {talking || hasTalk ? (
            <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-sunken" aria-hidden>
              <div
                className={cn(
                  "h-full rounded-full transition-[width]",
                  rec.seconds >= RECAP_MIN_SECONDS ? "bg-success" : "bg-highlight",
                )}
                style={{ width: `${Math.min(100, (rec.seconds / RECAP_TARGET_SECONDS) * 100)}%` }}
              />
            </div>
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
          <Textarea rows={6} lang="en" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}

      {short ? (
        <Notice tone="warning" icon={AlertTriangle}>
          {rec.supported
            ? t.tooShort(RECAP_MIN_SECONDS, RECAP_MIN_WORDS)
            : t.tooShortTyped(RECAP_MIN_TYPED_WORDS)}
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
              <Button variant="outline" onClick={rec.start} disabled={rec.seconds >= RECAP_MAX_SECONDS}>
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
    </div>
  );
}

function RecapResult({
  result,
  hints,
  aiEnabled,
  saving,
  onRetrySave,
  onAgain,
}: {
  result: Result;
  hints: Set<string>;
  aiEnabled: boolean;
  saving: boolean;
  onRetrySave: () => void;
  onAgain: () => void;
}) {
  const { found, confirmed, recap } = result;
  const ok = found.filter((w) => confirmed.has(w.id));
  const unsure = found.filter((w) => !confirmed.has(w.id));
  const fix = recap?.fix[0];

  return (
    <div className="animate-rise flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {t.resultTitle}
        </p>
        <p className="mt-1 font-display text-2xl font-semibold">{t.usedFree(ok.length)}</p>
        {ok.length ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {ok.map((w) => (
              <li
                key={w.id}
                title={w.uzbek}
                className="flex items-center gap-1.5 rounded-full border border-success/40 bg-success-soft px-3 py-1.5 text-sm font-semibold text-success"
              >
                <CheckCircle2 className="size-4" aria-hidden />
                <span lang="en">{w.english}</span>
                <span className="rounded-full bg-background/70 px-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {hints.has(w.id) ? t.hintTag : t.freeTag}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {unsure.length ? (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">{t.notConfirmed}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {unsure.map((w) => (
                <li key={w.id} title={w.uzbek} className="rounded-full border px-3 py-1 text-sm" lang="en">
                  {w.english}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {recap?.feedback_uz ? <p className="mt-4 text-sm">{recap.feedback_uz}</p> : null}
        {!aiEnabled || !recap ? <p className="mt-3 text-xs text-muted-foreground">{t.aiOff}</p> : null}
      </section>

      {fix ? (
        <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-soft)">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            <Wrench className="size-3.5" aria-hidden />
            {t.fixTitle}
          </p>
          <p className="mt-3 text-sm text-destructive line-through decoration-destructive/40" lang="en">
            {fix.said}
          </p>
          <p className="mt-1 text-lg font-semibold" lang="en">
            {fix.better}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{fix.explanation_uz}</p>
        </section>
      ) : null}

      {recap?.phrase.english ? <PhraseCard phrase={recap.phrase} /> : null}

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
              {t.retrySave}
            </Button>
          </div>
        </Notice>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button asChild size="lg">
          <Link href="/bugun">{t.backToday}</Link>
        </Button>
        <Button variant="outline" onClick={onAgain}>
          <Mic aria-hidden />
          {t.again}
        </Button>
      </div>
    </div>
  );
}

function PhraseCard({ phrase }: { phrase: Recap["phrase"] }) {
  const add = useMutation({
    mutationFn: async () => {
      const draft = itemInputSchema.parse({
        english: phrase.english,
        uzbek: phrase.uzbek || phrase.english,
        example_en: phrase.example || null,
        tags: ["kun-yakuni"],
      });
      return addItems(sb(), [draft], { schedule: true });
    },
  });
  return (
    <section className="rounded-2xl border border-highlight/60 bg-highlight-soft p-5 shadow-(--shadow-soft)">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-highlight-foreground uppercase">
        <Lightbulb className="size-3.5" aria-hidden />
        {t.phraseTitle}
      </p>
      <p className="mt-2 font-display text-xl font-semibold" lang="en">
        {phrase.english}
      </p>
      <p className="text-sm">{phrase.uzbek}</p>
      {phrase.example ? (
        <p className="mt-2 text-sm text-muted-foreground italic" lang="en">
          {phrase.example}
        </p>
      ) : null}
      {add.data ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          {add.data.inserted ? t.phraseAdded : t.phraseExists}
        </p>
      ) : (
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={() => add.mutate()}
          disabled={add.isPending}
        >
          {add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
          {t.addPhrase}
        </Button>
      )}
      {add.isError ? <p className="mt-2 text-sm text-destructive">{t.saveFailed}</p> : null}
    </section>
  );
}
