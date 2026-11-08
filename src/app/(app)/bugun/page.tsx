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
import { formatDayUz, greetingUz, studyStreak } from "@/lib/i18n/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.nav.today };

const STUDIED = ["learning", "review", "mastered"] as const;

async function getToday() {
  const supabase = await getSupabaseServerClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("timezone, daily_new_limit, daily_review_limit, direction_mode")
    .maybeSingle();
  const tz = settings?.timezone ?? DEFAULT_TZ;
  const mode = settings?.direction_mode ?? "random";
  const now = new Date();
  const today = todayInTz(tz, now);
  const yesterday = addDays(today, -1);
  const dayStart = startOfDayInTz(today, tz).toISOString();

  const [dueRes, stateRes, history, studiedYesterday, textsDue] = await Promise.all([
    supabase
      .from("cards")
      .select("id, item_id, direction, due_date, status")
      .in("status", [...STUDIED])
      .lte("due_date", today)
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
  ]);

  const error = dueRes.error ?? stateRes.error ?? history.error;
  const state = stateRes.data;
  const allowed = (direction: string) => mode === "random" || mode === "both" || direction === mode;
  const dueRows = (dueRes.data ?? []).filter((c) => allowed(c.direction));

  // Build today's queue exactly as the session does (random = first direction; only counts matter).
  const plan = buildDailyQueue({
    cards: [
      ...dueRows.map((r) => ({
        id: r.id,
        itemId: r.item_id,
        direction: r.direction,
        dueDate: r.due_date,
        status: r.status,
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
    directionMode: mode,
    random: () => 0,
  });

  const done = state?.cardsDoneToday ?? 0;
  const studiedDays = (history.data ?? []).map((r) => r.day);
  if ((studiedYesterday.count ?? 0) > 0) studiedDays.push(yesterday);
  if (done > 0) studiedDays.push(today);

  return {
    error,
    today,
    hour: hourInTz(now, tz),
    /** Reviews in today's plan: due cards (review limit applied) plus second directions. */
    reviews: plan.reviewCount + plan.secondCount,
    overdue: dueRows.filter((c) => c.due_date < today).length,
    dueLater: plan.dueRemaining,
    newWords: plan.newWords,
    waitingWords: plan.waitingWords,
    laterWords: plan.waitingWords - plan.newWords,
    remaining: plan.queue.length,
    done,
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
  const isEmpty = t.remaining === 0 && t.waitingWords === 0 && t.done === 0 && t.dueLater === 0;

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
              {allDone ? uz.today.allDone : uz.today.dueTitle}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {allDone
                ? t.laterWords > 0
                  ? uz.today.newLimitReached(t.laterWords)
                  : t.dueLater > 0
                    ? uz.today.reviewLimitReached(t.dueLater)
                    : uz.today.allDoneBody
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
        <Stat label={uz.today.statDue} value={t.reviews} icon={CalendarClock} />
        <Stat
          label={uz.today.statOverdue}
          value={t.overdue}
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
