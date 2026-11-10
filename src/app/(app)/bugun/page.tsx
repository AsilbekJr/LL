import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BookOpenText,
  CalendarClock,
  Check,
  Flame,
  Mic,
  Play,
  Plus,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { FlashNotice } from "@/components/common/flash-notice";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, DEFAULT_TZ, hourInTz, startOfDayInTz, todayInTz } from "@/lib/srs/dates";
import { buildDailyQueue } from "@/lib/srs/queue";
import { loadTodayState } from "@/lib/session/today-state";
import { ACTIVE_DAYS, activeCount, spokenDays } from "@/lib/production/active";
import { fetchCorrections, fetchSpokenUses } from "@/lib/production/api";
import { HARD_LAPSES } from "@/lib/items/library";
import { formatDayUz, greetingUz, studyStreak } from "@/lib/i18n/format";
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
  const [dueRes, stateRes, history, studiedYesterday, textsDue, itemsRes, nextRes] = await Promise.all([
    // Due today, plus tomorrow's cards for the "what comes next" line.
    supabase
      .from("cards")
      .select("id, item_id, direction, due_date, status, last_reviewed_at")
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
    supabase.from("reading_texts").select("id", { count: "exact", head: true }).lte("due_date", today),
    supabase.from("items").select("id", { count: "exact", head: true }),
    // The next day with a review after tomorrow.
    supabase
      .from("cards")
      .select("due_date")
      .in("status", [...STUDIED])
      .gt("due_date", tomorrow)
      .order("due_date")
      .limit(1),
  ]);

  // Extras: speaking progress. Never fail the page because of them.
  const [uses, corrections, hardCards] = await Promise.all([
    fetchSpokenUses(supabase).catch(() => []),
    fetchCorrections(supabase).catch(() => []),
    // Words that keep being forgotten: they need a better example, not more repeats.
    supabase.from("cards").select("item_id").in("status", ["learning", "review"]).gte("lapses", HARD_LAPSES),
  ]);

  const error = dueRes.error ?? stateRes.error ?? history.error ?? itemsRes.error;
  const state = stateRes.data;
  const scheduled = dueRes.data ?? [];
  const dueRows = scheduled.filter((c) => c.due_date <= today);

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
    newLimit: settings?.daily_new_limit ?? 15,
    reviewLimit: settings?.daily_review_limit ?? 150,
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
    // Optional extra: never fail the page if texts are unavailable.
    textsDue: textsDue.error ? 0 : (textsDue.count ?? 0),
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

      {t.overdue > 0 ? (
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
              {allDone ? (t.done > 0 ? uz.today.allDone : uz.today.restDay) : uz.today.dueTitle}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {allDone
                ? [
                    t.laterWords > 0 ? uz.today.newLimitReached(t.laterWords) : "",
                    t.dueLater > 0 ? uz.today.reviewLimitReached(t.dueLater) : "",
                    uz.today.next(t.tomorrowWords, t.tomorrowNew, t.nextDay ? formatDayUz(t.nextDay) : null),
                  ]
                    .filter(Boolean)
                    .join(" ")
                : uz.today.planBody(t.reviews, t.newWords)}
            </p>
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

      {/* Stats */}
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={uz.today.statDue} value={t.reviews} suffix={uz.today.words} icon={CalendarClock} />
        <Stat
          label={uz.today.statOverdue}
          value={t.overdue}
          suffix={uz.today.words}
          icon={AlertTriangle}
          tone={t.overdue > 0 ? "danger" : undefined}
        />
        <Stat label={uz.today.statNew} value={t.waitingWords} suffix={uz.today.words} icon={Sparkles} />
        <Stat
          label={uz.today.statStreak}
          value={t.streak}
          suffix={uz.today.days}
          icon={Flame}
          tone={t.streak > 0 ? "streak" : undefined}
        />
      </dl>

      {/* The goal of it all: words you can actually use when speaking. */}
      <Link
        href="/nutq"
        className="mt-3 block rounded-xl border bg-card p-4 shadow-(--shadow-soft) transition-colors outline-none hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Mic className="size-3.5" aria-hidden />
            {uz.today.activeTitle}
          </p>
          <p className="font-display text-xl font-semibold tabular-nums">
            {t.activeWords} / {t.items}
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-label={uz.today.activeTitle}
          aria-valuemin={0}
          aria-valuemax={t.items}
          aria-valuenow={t.activeWords}
        >
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${t.items ? Math.round((t.activeWords / t.items) * 100) : 0}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{uz.today.activeBody(ACTIVE_DAYS)}</p>
      </Link>

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

      {/* Quick actions */}
      <section aria-labelledby="quick-title" className="mt-8">
        <h2
          id="quick-title"
          className="mb-3 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase"
        >
          {uz.today.quickTitle}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          <QuickLink href="/qoshish" icon={Plus} label={uz.today.addWord} />
          <QuickLink href="/import" icon={Upload} label={uz.today.importPack} />
          <QuickLink href="/nutq" icon={Mic} label={uz.nav.speaking} />
          <QuickLink
            href="/matnlar"
            icon={BookOpenText}
            label={t.textsDue ? uz.today.textsDue(t.textsDue) : uz.nav.texts}
            highlight={t.textsDue > 0}
          />
        </ul>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "danger" | "streak";
  suffix?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-(--shadow-soft)",
        tone === "danger" && "border-destructive/30 bg-destructive-soft",
        tone === "streak" && "border-highlight/60 bg-highlight-soft",
      )}
    >
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon
          className={cn(
            "size-3.5",
            tone === "danger" && "text-destructive",
            tone === "streak" && "text-highlight-foreground",
          )}
          aria-hidden
        />
        {label}
      </dt>
      <dd className="mt-1.5 flex items-baseline gap-1">
        <span
          className={cn(
            "font-display text-3xl leading-none font-semibold tabular-nums",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </span>
        {suffix ? <span className="text-xs font-semibold text-muted-foreground">{suffix}</span> : null}
      </dd>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  highlight,
}: {
  href: "/qoshish" | "/import" | "/nutq" | "/matnlar";
  icon: LucideIcon;
  label: string;
  highlight?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group flex h-14 items-center gap-3 rounded-xl border bg-card px-4 text-sm font-semibold shadow-(--shadow-soft) transition-colors outline-none hover:border-primary/30 hover:bg-primary-soft/40 focus-visible:ring-2 focus-visible:ring-ring/50",
          highlight && "border-highlight/60 bg-highlight-soft",
        )}
      >
        <span className="grid size-8 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="flex-1">{label}</span>
        <ArrowRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </Link>
    </li>
  );
}
