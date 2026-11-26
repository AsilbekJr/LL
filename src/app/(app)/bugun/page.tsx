import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookHeart,
  BookOpen,
  Check,
  Flame,
  Mic,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { FlashNotice } from "@/components/common/flash-notice";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, dayInTz, DEFAULT_TZ, hourInTz, startOfDayInTz, todayInTz } from "@/lib/srs/dates";
import { fetchRecapRows } from "@/lib/speaking/recap-api";
import { recapProgress } from "@/lib/speaking/recap";
import { storyWeek } from "@/lib/story/story";
import { summaryWeek, weeklySummary } from "@/lib/production/weekly";
import { buildDailyQueue } from "@/lib/srs/queue";
import { loadTodayState } from "@/lib/session/today-state";
import { loadCohortTotals, loadWordHistory } from "@/lib/session/cohorts";
import { backlogQueueOptions, loadBacklogStats, todayBacklog } from "@/lib/session/backlog-state";
import { intervalOf } from "@/lib/srs/backlog";
import { groupTodayByCohort, wordCohort, type PlanWord } from "@/lib/srs/cohorts";
import { CohortMap } from "@/components/cohorts/cohort-map";
import { activeJourney, activeCount, spokenDays } from "@/lib/production/active";
import { fetchCorrections, fetchSpokenUses } from "@/lib/production/api";
import { HARD_LAPSES } from "@/lib/items/library";
import { formatDayUz, greetingUz, sessionMinutes, studyStreak } from "@/lib/i18n/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.nav.today };

const STUDIED = ["learning", "review", "mastered"] as const;

async function getToday() {
  const supabase = await getSupabaseServerClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("timezone, daily_new_limit, daily_review_limit")
    .maybeSingle();
  const tz = settings?.timezone ?? DEFAULT_TZ;
  const now = new Date();
  const today = todayInTz(tz, now);
  const yesterday = addDays(today, -1);
  const dayStart = startOfDayInTz(today, tz).toISOString();

  const tomorrow = addDays(today, 1);
  const [dueRes, stateRes, history, studiedYesterday, itemsRes, nextRes, backlogStats] = await Promise.all([
    // Due today, plus tomorrow's cards for the "what comes next" line.
    supabase
      .from("cards")
      .select("id, item_id, direction, due_date, status, last_reviewed_at, lapses")
      .in("status", [...STUDIED])
      .lte("due_date", tomorrow)
      .limit(10000),
    // The very same loader the review session uses, so the numbers match it.
    loadTodayState(supabase, dayStart).then(
      (s) => ({ data: s, error: null }),
      (e: unknown) => ({ data: null, error: e instanceof Error ? e : new Error(String(e)) }),
    ),
    supabase
      .from("daily_snapshots")
      .select("day")
      .gt("done_count", 0)
      .order("day", { ascending: false })
      .limit(366),
    // Yesterday's snapshot is written just after midnight; until then read the logs.
    supabase
      .from("review_logs")
      .select("id", { count: "exact", head: true })
      .gte("reviewed_at", startOfDayInTz(yesterday, tz).toISOString())
      .lt("reviewed_at", dayStart)
      .not("result", "is", null),
    supabase.from("items").select("id", { count: "exact", head: true }),
    // The next day with a review after tomorrow.
    supabase
      .from("cards")
      .select("due_date")
      .in("status", [...STUDIED])
      .gt("due_date", tomorrow)
      .order("due_date")
      .limit(1),
    // Qaytish rejimi: last study day and the usual daily load (null on error = off).
    loadBacklogStats(supabase, today, tz),
  ]);

  // Extras: speaking progress. Never fail the page because of them.
  // Haftalik hikoya: shown on the weekend, while this week's story is not retold yet.
  const week = storyWeek(today);
  const [uses, corrections, hardCards, recapRows, storyRows] = await Promise.all([
    fetchSpokenUses(supabase).catch(() => []),
    fetchCorrections(supabase).catch(() => []),
    // Words that keep being forgotten: they need a better example, not more repeats.
    supabase.from("cards").select("item_id").in("status", ["learning", "review"]).gte("lapses", HARD_LAPSES),
    // Kun yakuni: speaking days of the last two months.
    fetchRecapRows(supabase, startOfDayInTz(addDays(today, -60), tz).toISOString()).catch(() => []),
    week.current
      ? supabase
          .from("weekly_stories")
          .select("best_retell, retold_at")
          .eq("week_start", week.weekStart)
          .then((r) => (r.error ? [] : (r.data ?? [])))
      : Promise.resolve([]),
  ]);
  const retold = storyRows.filter((r) => r.retold_at);

  // Haftalik xulosa: at the end of the week (and on Monday for the week just gone).
  const sumWeek = summaryWeek(today);
  const summary = sumWeek ? weeklySummary(uses, sumWeek, tz) : null;
  const summaryIds = summary ? [...summary.newlyActive, ...(summary.top ? [summary.top.itemId] : [])] : [];
  const names = summaryIds.length
    ? await supabase
        .from("items")
        .select("id, english")
        .in("id", summaryIds.slice(0, 50))
        .then((r) => new Map((r.data ?? []).map((i) => [i.id, i.english])))
    : new Map<string, string>();
  const weekly =
    summary && (summary.uses > 0 || summary.newlyActive.length > 0)
      ? {
          thisWeek: sumWeek === storyWeek(today).weekStart && storyWeek(today).current,
          newlyActive: summary.newlyActive.flatMap((id) => (names.has(id) ? [names.get(id)!] : [])),
          uses: summary.uses,
          top:
            summary.top && names.has(summary.top.itemId)
              ? { english: names.get(summary.top.itemId)!, count: summary.top.count }
              : null,
        }
      : null;
  const recap = recapProgress(recapRows, (iso) => dayInTz(new Date(iso), tz));

  const error = dueRes.error ?? stateRes.error ?? history.error ?? itemsRes.error;
  const state = stateRes.data;
  const scheduled = dueRes.data ?? [];
  const dueRows = scheduled.filter((c) => c.due_date <= today);
  const backlog = todayBacklog(backlogStats, {
    today,
    dueRows,
    reviewsDoneToday: state?.reviewsDoneToday ?? 0,
  });

  // Build today's queue exactly as the session does (random = first direction; only counts matter).
  const plan = buildDailyQueue({
    cards: [
      ...dueRows.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        direction: r.direction,
        dueDate: r.due_date,
        status: r.status,
        lastReviewedAt: r.last_reviewed_at,
        intervalDays: intervalOf(r.due_date, r.last_reviewed_at, tz),
      })),
      ...(state?.newCards ?? []).map((r) => ({
        id: r.id,
        itemId: r.item_id,
        direction: r.direction,
        dueDate: today,
        status: "new" as const,
      })),
    ],
    today,
    reviewLimit: settings?.daily_review_limit ?? 150,
    ...backlogQueueOptions(backlog, settings?.daily_new_limit ?? 15),
    newItemsDoneToday: state?.newItemsDoneToday ?? 0,
    reviewsDoneToday: state?.reviewsDoneToday ?? 0,
    startedItems: state?.startedItems,
    touchedToday: state?.touchedToday,
    readyItems: state?.readyItems,
  });

  // Count WORDS, as the library does: in 'both' mode a word brings two cards.
  const started = state?.startedItems ?? new Set<string>();
  const reviewCards = plan.queue.filter((c) => c.status !== "new" || started.has(c.itemId));
  const reviewWords = new Set(reviewCards.map((c) => c.itemId));
  // Done = cards practised today that are not waiting in the queue any more
  // (a card answered "Again" and left unfinished is still to do, not done).
  const queued = new Set(plan.queue.map((c) => c.id));
  const practised = state?.practisedToday ?? new Set<string>();
  const done = [...practised].filter((id) => !queued.has(id)).length;

  // Tomorrow: words due tomorrow, words whose other direction was left for
  // tomorrow, and second directions that are waiting for their day.
  const todayWords = new Set(plan.queue.map((c) => c.itemId));
  const tomorrowWords = new Set([
    ...scheduled.filter((c) => c.due_date === tomorrow).map((c) => c.item_id),
    ...plan.deferred.map((c) => c.itemId),
    ...(state?.newCards ?? [])
      .filter((c) => started.has(c.item_id) && state?.readyItems.has(c.item_id) && !queued.has(c.id))
      .map((c) => c.item_id),
  ]);
  const laterWords = plan.waitingWords - plan.newWords;

  // Takrorlash xaritasi: today's words by the day they were first studied.
  // An extra: never fail the page because of it.
  const lapsesOf = new Map(dueRows.map((r) => [r.id, r.lapses]));
  const planWords: PlanWord[] = plan.queue.map((c) => ({
    itemId: c.itemId,
    dueDate: c.dueDate,
    status: c.status,
    lapses: lapsesOf.get(c.id) ?? 0,
  }));
  const cohorts = await (async () => {
    if (planWords.length === 0) return [];
    const [history, totals] = await Promise.all([
      loadWordHistory(
        supabase,
        planWords.map((w) => w.itemId),
        dayStart,
        tz,
      ),
      loadCohortTotals(supabase, dayStart, tz),
    ]);
    const touched = state?.touchedToday ?? new Set<string>();
    // Today's cohort: words started today (already met or still to meet).
    const startedToday = new Set([...touched].filter((id) => !history.has(id)));
    for (const w of planWords) {
      if (wordCohort(w, history, startedToday, today).repetition === 0) startedToday.add(w.itemId);
    }
    totals.set(today, startedToday.size);
    return groupTodayByCohort(planWords, history, totals, today, startedToday);
  })().catch(() => []);
  const studiedDays = (history.data ?? []).map((r) => r.day);
  if ((studiedYesterday.count ?? 0) > 0) studiedDays.push(yesterday);
  if (practised.size > 0) studiedDays.push(today);

  return {
    error,
    today,
    hour: hourInTz(now, tz),
    /** Reviews in today's plan: due cards (review limit applied) plus second directions. */
    /** Words to review today (due reviews + second directions), and their cards. */
    reviews: reviewWords.size,
    reviewCards: reviewCards.length,
    /** Words in today's plan that are overdue. */
    overdue: new Set(reviewCards.filter((c) => c.dueDate < today).map((c) => c.itemId)).size,
    dueLater: plan.dueRemaining,
    newWords: plan.newWords,
    waitingWords: plan.waitingWords,
    laterWords,
    remaining: plan.queue.length,
    done,
    items: itemsRes.count ?? 0,
    activeWords: activeCount(spokenDays(uses, tz)),
    fixes: corrections.length,
    hardWords: new Set((hardCards.data ?? []).map((c) => c.item_id)).size,
    todayWords: todayWords.size,
    tomorrowWords: tomorrowWords.size,
    /** New words tomorrow's limit will let in. */
    tomorrowNew: Math.min(laterWords, settings?.daily_new_limit ?? 15),
    nextDay: tomorrowWords.size ? null : (nextRes.data?.[0]?.due_date ?? null),
    streak: studyStreak(studiedDays, today),
    cohorts,
    backlog,
    recapDone: recap.days.has(today),
    recapWords: recap.usedOn(today),
    recapStreak: studyStreak(recap.days, today),
    weekly,
    story: week.current
      ? { done: retold.length > 0, best: Math.max(0, ...retold.map((r) => r.best_retell ?? 0)) }
      : null,
  };
}

export default async function TodayPage() {
  const t = await getToday();

  if (t.error) {
    return (
      <>
        <PageHeader title={uz.nav.today} />
        <EmptyState icon={AlertTriangle} title={uz.common.errorTitle} description={uz.common.errorBody} />
      </>
    );
  }

  const header = (
    <>
      <PageHeader eyebrow={formatDayUz(t.today)} title={greetingUz(t.hour)} />
      <FlashNotice />
    </>
  );
  // Empty only when the library is: a day with nothing due is a rest day, not an empty notebook.
  const isEmpty = t.items === 0;

  if (isEmpty) {
    return (
      <>
        {header}
        <EmptyState
          icon={BookOpen}
          title={uz.today.emptyTitle}
          description={uz.today.emptyBody}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/qoshish">
                  <Plus aria-hidden />
                  {uz.today.addWord}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/import">
                  <Upload aria-hidden />
                  {uz.today.importPack}
                </Link>
              </Button>
            </div>
          }
        />
      </>
    );
  }

  // Today's plan = the session's queue: due reviews + today's new words (within the daily limits).
  const remaining = t.remaining;
  const total = t.done + remaining;
  const allDone = remaining === 0;

  return (
    <>
      {header}

      {t.backlog.active ? (
        <BacklogBanner
          gapDays={t.backlog.gapDays}
          cap={t.backlog.todayCap}
          remaining={t.dueLater}
          days={Math.ceil(t.dueLater / Math.max(1, t.backlog.normal))}
          done={allDone}
        />
      ) : t.overdue > 0 ? (
        <div
          role="status"
          className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {uz.today.overdueBanner(t.overdue)}
        </div>
      ) : null}

      {/* Hero: today's session */}
      <section
        aria-labelledby="today-title"
        className="bg-ruled relative overflow-hidden rounded-2xl border bg-card p-5 shadow-(--shadow-lift) sm:p-7"
      >
        <div className="flex items-center gap-5 sm:gap-7">
          <ProgressRing
            value={total ? t.done / total : 1}
            label={uz.today.progressLabel}
            size={104}
            stroke={10}
          >
            {allDone ? (
              <Check className="size-9 text-success" aria-hidden strokeWidth={2.5} />
            ) : (
              <span className="leading-none">
                <span className="block font-display text-3xl font-semibold tabular-nums">{remaining}</span>
                <span className="mt-1 block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {uz.today.remaining}
                </span>
              </span>
            )}
          </ProgressRing>

          <div className="min-w-0 flex-1">
            <h2 id="today-title" className="font-display text-2xl leading-tight font-semibold">
              {allDone
                ? t.backlog.active
                  ? uz.backlog.doneTitle
                  : t.done > 0
                    ? uz.today.allDone
                    : uz.today.restDay
                : uz.today.dueTitle}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {allDone && t.backlog.active
                ? uz.backlog.doneBody(t.dueLater, Math.ceil(t.dueLater / Math.max(1, t.backlog.normal)))
                : allDone
                  ? [
                      t.laterWords > 0 ? uz.today.newLimitReached(t.laterWords) : "",
                      t.dueLater > 0 ? uz.today.reviewLimitReached(t.dueLater) : "",
                      uz.today.next(
                        t.tomorrowWords,
                        t.tomorrowNew,
                        t.nextDay ? formatDayUz(t.nextDay) : null,
                      ),
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : `${uz.today.planBody(t.reviews, t.newWords)} ${uz.today.minutes(sessionMinutes(t.reviews, t.newWords))}`}
            </p>
            {t.streak > 0 ? (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-highlight-soft px-2 py-0.5 text-xs font-semibold text-highlight-foreground">
                <Flame className="size-3.5" aria-hidden />
                {uz.today.streakChip(t.streak)}
              </p>
            ) : null}
            {t.done > 0 && !allDone ? (
              <p className="mt-2 text-xs font-semibold text-muted-foreground tabular-nums">
                <span className="mark-highlight text-foreground">{uz.today.doneOf(t.done, total)}</span>{" "}
                bajarildi
              </p>
            ) : null}
          </div>
        </div>

        {!allDone ? (
          <Button asChild size="lg" className="mt-6 w-full text-base">
            <Link href="/takrorlash">
              <Play className="size-5 fill-current" aria-hidden />
              {uz.today.start}
            </Link>
          </Button>
        ) : null}
      </section>

      <RecapCard done={t.recapDone} words={t.recapWords} streak={t.recapStreak} />
      {t.story ? <StoryCard done={t.story.done} best={t.story.best} /> : null}
      {t.weekly ? <WeeklyCard {...t.weekly} /> : null}

      {!allDone ? <CohortMap cohorts={t.cohorts} today={t.today} /> : null}

      {/* The goal of it all: words you can actually use when speaking. */}
      <JourneyCard count={t.activeWords} />

      {t.fixes > 0 ? (
        <Link
          href="/nutq?tab=fix"
          className="mt-3 flex items-center gap-3 rounded-xl border border-highlight/60 bg-highlight-soft px-4 py-3 text-sm font-semibold shadow-(--shadow-soft) outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Mic className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{uz.today.fixesWaiting(t.fixes)}</span>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      {t.hardWords > 0 ? (
        <Link
          href="/kutubxona?qiyin=1"
          className="mt-3 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm font-semibold shadow-(--shadow-soft) outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
          <span className="flex-1">{uz.today.hardWaiting(t.hardWords)}</span>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}
    </>
  );
}

/** Kun yakuni: the daily free talk — the step that turns words into speech. */
function RecapCard({ done, words, streak }: { done: boolean; words: number; streak: number }) {
  return (
    <Link
      href="/kun-yakuni"
      className={cn(
        "mt-3 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-(--shadow-soft) transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        done
          ? "bg-card hover:border-primary/30"
          : "border-primary/30 bg-primary-soft/50 hover:bg-primary-soft",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          done ? "bg-success-soft text-success" : "bg-primary text-primary-foreground",
        )}
      >
        {done ? <Check className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{uz.recap.card}</span>
        <span className="block text-xs text-muted-foreground">
          {done ? uz.recap.cardDone(words) : uz.recap.cardTodo}
          {streak > 1 ? ` · ${uz.recap.streak(streak)}` : ""}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Haftalik xulosa: what the week of speaking added up to. */
function WeeklyCard({
  thisWeek,
  newlyActive,
  uses,
  top,
}: {
  thisWeek: boolean;
  newlyActive: string[];
  uses: number;
  top: { english: string; count: number } | null;
}) {
  const w = uz.weekly;
  return (
    <section className="mt-3 rounded-2xl border bg-card p-4 shadow-(--shadow-soft)">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <Sparkles className="size-3.5" aria-hidden />
        {thisWeek ? w.thisWeek : w.lastWeek}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">{w.newActive}</dt>
          <dd className="font-display text-2xl font-semibold text-success tabular-nums">
            {newlyActive.length}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{w.uses}</dt>
          <dd className="font-display text-2xl font-semibold tabular-nums">{uses}</dd>
        </div>
      </dl>
      {newlyActive.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {newlyActive.slice(0, 8).map((e) => (
            <li
              key={e}
              lang="en"
              className="rounded-full border border-success/40 bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success"
            >
              {e}
            </li>
          ))}
          {newlyActive.length > 8 ? (
            <li className="px-1 text-xs text-muted-foreground">+{newlyActive.length - 8}</li>
          ) : null}
        </ul>
      ) : null}
      {top ? (
        <p className="mt-3 text-sm">
          {w.top}{" "}
          <span className="font-semibold" lang="en">
            {top.english}
          </span>{" "}
          <span className="text-muted-foreground">{w.times(top.count)}</span>
        </p>
      ) : null}
    </section>
  );
}

/** Active vocabulary: the count, the milestone passed and the next one (the journey has no end). */
function JourneyCard({ count }: { count: number }) {
  const j = activeJourney(count);
  const a = uz.active;
  return (
    <Link
      href="/nutq"
      className="mt-3 block rounded-2xl border bg-card p-4 shadow-(--shadow-soft) transition-colors outline-none hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Mic className="size-3.5" aria-hidden />
          {a.journeyTitle}
        </p>
        <p className="font-display text-2xl font-semibold tabular-nums">{j.count}</p>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground tabular-nums">
        <span>{j.prev}</span>
        <div
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-label={a.journeyTitle}
          aria-valuemin={j.prev}
          aria-valuemax={j.next}
          aria-valuenow={j.count}
        >
          <div
            className="h-full rounded-full bg-success transition-[width] duration-700"
            style={{ width: `${Math.max(j.count > j.prev ? 3 : 0, Math.round(j.toNext * 100))}%` }}
          />
        </div>
        <span>{j.next}</span>
      </div>
      <p className="mt-2 text-xs font-medium">{a.nextMilestone(j.next - j.count, j.next)}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{a.howTo}</p>
    </Link>
  );
}

/** Haftalik hikoya: on the weekend, memorize and retell a story made of the week's words. */
function StoryCard({ done, best }: { done: boolean; best: number }) {
  return (
    <Link
      href="/hikoya"
      className={cn(
        "mt-3 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-(--shadow-soft) transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        done
          ? "bg-card hover:border-primary/30"
          : "border-highlight-foreground/30 bg-highlight-soft hover:brightness-95",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          done ? "bg-success-soft text-success" : "bg-highlight-foreground text-background",
        )}
      >
        {done ? <Check className="size-5" aria-hidden /> : <BookHeart className="size-5" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{uz.story.card}</span>
        <span className="block text-xs text-muted-foreground">
          {done ? uz.story.cardDone(best) : uz.story.cardTodo}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

/** Qaytish rejimi: today takes the usual load, the rest waits, new words pause. */
function BacklogBanner({
  gapDays,
  cap,
  remaining,
  days,
  done,
}: {
  gapDays: number;
  cap: number;
  remaining: number;
  days: number;
  done: boolean;
}) {
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-highlight/60 bg-highlight-soft px-4 py-3 text-sm text-highlight-foreground"
    >
      <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">{gapDays >= 2 ? uz.backlog.titleAway(gapDays) : uz.backlog.titleBusy}</p>
        {!done && remaining > 0 ? <p>{uz.backlog.body(cap, remaining, days)}</p> : null}
        <p>
          {uz.backlog.order} {uz.backlog.paused}
        </p>
      </div>
    </div>
  );
}
