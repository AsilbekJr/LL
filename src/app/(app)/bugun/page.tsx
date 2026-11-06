import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
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
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_TZ, hourInTz, startOfDayInTz, todayInTz } from "@/lib/srs/dates";
import { formatDayUz, greetingUz, studyStreak } from "@/lib/i18n/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.nav.today };

const STUDIED = ["learning", "review", "mastered"] as const;

async function getToday() {
  const supabase = await getSupabaseServerClient();
  const { data: settings } = await supabase.from("settings").select("timezone").maybeSingle();
  const tz = settings?.timezone ?? DEFAULT_TZ;
  const now = new Date();
  const today = todayInTz(tz, now);
  const dayStart = startOfDayInTz(today, tz).toISOString();

  const cards = () => supabase.from("cards").select("id", { count: "exact", head: true });
  const [due, overdue, fresh, doneToday, history] = await Promise.all([
    cards()
      .in("status", [...STUDIED])
      .lte("due_date", today),
    cards()
      .in("status", [...STUDIED])
      .lt("due_date", today),
    cards().eq("status", "new"),
    supabase.from("review_logs").select("id", { count: "exact", head: true }).gte("reviewed_at", dayStart),
    supabase
      .from("daily_snapshots")
      .select("day")
      .gt("done_count", 0)
      .order("day", { ascending: false })
      .limit(366),
  ]);

  const error = due.error ?? overdue.error ?? fresh.error ?? doneToday.error ?? history.error;
  const done = doneToday.count ?? 0;
  const studiedDays = (history.data ?? []).map((r) => r.day);
  if (done > 0) studiedDays.push(today);

  return {
    error,
    today,
    hour: hourInTz(now, tz),
    due: due.count ?? 0,
    overdue: overdue.count ?? 0,
    fresh: fresh.count ?? 0,
    done,
    streak: studyStreak(studiedDays, today),
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

  const header = <PageHeader eyebrow={formatDayUz(t.today)} title={greetingUz(t.hour)} />;
  const isEmpty = t.due === 0 && t.fresh === 0 && t.done === 0;

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

  const total = t.done + t.due;
  const allDone = t.due === 0;

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
                <span className="block font-display text-3xl font-semibold tabular-nums">{t.due}</span>
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
              {allDone ? uz.today.allDoneBody : uz.today.dueBody(t.due)}
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
          <div className="mt-6">
            <Button size="lg" className="w-full text-base" disabled aria-describedby="start-hint">
              <Play className="size-5 fill-current" aria-hidden />
              {uz.today.start}
            </Button>
            <p id="start-hint" className="mt-2 text-center text-xs text-muted-foreground">
              {uz.common.comingInPhase(4)}
            </p>
          </div>
        ) : null}
      </section>

      {/* Stats */}
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={uz.today.statDue} value={t.due} icon={CalendarClock} />
        <Stat
          label={uz.today.statOverdue}
          value={t.overdue}
          icon={AlertTriangle}
          tone={t.overdue > 0 ? "danger" : undefined}
        />
        <Stat label={uz.today.statNew} value={t.fresh} icon={Sparkles} />
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
        <ul className="grid gap-2 sm:grid-cols-3">
          <QuickLink href="/qoshish" icon={Plus} label={uz.today.addWord} />
          <QuickLink href="/import" icon={Upload} label={uz.today.importPack} />
          <QuickLink href="/nutq" icon={Mic} label={uz.nav.speaking} />
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
}: {
  href: "/qoshish" | "/import" | "/nutq";
  icon: LucideIcon;
  label: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-14 items-center gap-3 rounded-xl border bg-card px-4 text-sm font-semibold shadow-(--shadow-soft) transition-colors outline-none hover:border-primary/30 hover:bg-primary-soft/40 focus-visible:ring-2 focus-visible:ring-ring/50"
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
