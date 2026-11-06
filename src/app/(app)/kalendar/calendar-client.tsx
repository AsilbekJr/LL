"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CircleDashed, Minus, X } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { StatTile } from "@/components/charts/charts";
import { ReviewHeatmap } from "@/components/charts/heatmap";
import { Button } from "@/components/ui/button";
import { fetchCalendar, fetchDayItems, type CalendarData } from "@/lib/stats/api";
import {
  dayStatus,
  monthGrid,
  monthStart,
  shiftMonth,
  type DayCounts,
  type DayStatus,
} from "@/lib/stats/calendar";
import type { IsoDate } from "@/lib/srs/dates";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDayUz } from "@/lib/i18n/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<DayStatus, { cell: string; icon: typeof Check | null }> = {
  done: { cell: "bg-success-soft text-success", icon: Check },
  partial: { cell: "bg-warning-soft text-warning", icon: Minus },
  missed: { cell: "bg-destructive-soft text-destructive", icon: X },
  planned: { cell: "bg-primary-soft text-primary-soft-foreground", icon: CircleDashed },
  rest: { cell: "text-muted-foreground", icon: null },
};

function countsFor(day: IsoDate, d: CalendarData): DayCounts | undefined {
  if (day === d.today) return { due: d.todayDue, done: d.todayDone, missed: 0 };
  if (day > d.today) {
    const n = d.forecast.get(day);
    return n ? { due: n, done: 0, missed: 0 } : undefined;
  }
  const s = d.history.get(day);
  return s ? { due: s.due, done: s.done, missed: s.missed } : undefined;
}

export function CalendarClient() {
  const t = uz.calendar;
  const q = useQuery({ queryKey: ["calendar"], queryFn: () => fetchCalendar(getSupabaseBrowserClient()) });
  const [month, setMonth] = useState<IsoDate | null>(null);
  const [selected, setSelected] = useState<IsoDate | null>(null);

  const heat = useMemo(() => {
    const m = new Map<IsoDate, number>();
    if (!q.data) return m;
    for (const [day, s] of q.data.history) m.set(day, s.reviews);
    m.set(q.data.today, q.data.todayReviews);
    return m;
  }, [q.data]);

  if (q.isPending) return <div className="h-96 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />;
  if (q.isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={uz.common.errorTitle}
        description={uz.common.errorBody}
        action={<Button onClick={() => q.refetch()}>{uz.common.retry}</Button>}
      />
    );
  }

  const data = q.data;
  const shown = month ?? monthStart(data.today);
  const weeks = monthGrid(shown);
  const [y, m] = shown.split("-").map(Number) as [number, number];
  const activeDays = [...heat.values()].filter((v) => v > 0).length;
  const sel = selected ? countsFor(selected, data) : undefined;
  const selReviews =
    selected === data.today ? data.todayReviews : selected ? data.history.get(selected)?.reviews : 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border bg-card p-4 shadow-(--shadow-soft) sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.prev}
            onClick={() => setMonth(shiftMonth(shown, -1))}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <div className="text-center">
            <h2 className="font-display text-xl font-semibold" aria-live="polite">
              {t.months[m - 1]} {y}
            </h2>
            {shown !== monthStart(data.today) ? (
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:underline"
                onClick={() => setMonth(null)}
              >
                {t.thisMonth}
              </button>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.next}
            onClick={() => setMonth(shiftMonth(shown, 1))}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>

        <table className="w-full table-fixed border-separate border-spacing-1">
          <caption className="sr-only">
            {t.months[m - 1]} {y}
          </caption>
          <thead>
            <tr>
              {t.weekdays.map((w) => (
                <th key={w} scope="col" className="pb-1 text-xs font-semibold text-muted-foreground">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  if (!day) return <td key={di} />;
                  const c = countsFor(day, data);
                  const status = dayStatus(day, data.today, c);
                  const style = STATUS_STYLE[status];
                  const Icon = style.icon;
                  const n = status === "planned" ? c?.due : c?.done;
                  return (
                    <td key={day} className="p-0">
                      <button
                        type="button"
                        onClick={() => setSelected(day === selected ? null : day)}
                        aria-pressed={selected === day}
                        aria-label={`${formatDayUz(day)}: ${t.status[status]}${n ? `, ${n}` : ""}`}
                        className={cn(
                          "flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          style.cell,
                          day === data.today && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                          selected === day && "outline-2 outline-foreground",
                        )}
                      >
                        <span className="leading-none">{Number(day.slice(8))}</span>
                        {Icon ? (
                          <span className="flex items-center gap-0.5 text-[10px] leading-none">
                            <Icon className="size-3" aria-hidden />
                            {n ? <span className="hidden tabular-nums sm:inline">{n}</span> : null}
                          </span>
                        ) : (
                          <span className="h-3" />
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        {/* legend: icon + label, never color alone */}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {(["done", "partial", "missed", "planned"] as const).map((s) => {
            const Icon = STATUS_STYLE[s].icon!;
            return (
              <li key={s} className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("grid size-5 place-items-center rounded-md", STATUS_STYLE[s].cell)}>
                  <Icon className="size-3" aria-hidden />
                </span>
                {t.status[s]}
              </li>
            );
          })}
        </ul>

        {selected ? (
          <div
            className="animate-rise mt-4 rounded-xl border bg-background/70 px-4 py-3 text-sm"
            aria-live="polite"
          >
            <p className="font-semibold">
              {formatDayUz(selected)}
              {selected === data.today ? ` · ${t.today}` : ""}
            </p>
            {sel ? (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {sel.done ? <li>{t.dayDone(sel.done)}</li> : null}
                {selected >= data.today && sel.due ? <li>{t.dayDue(sel.due)}</li> : null}
                {sel.missed ? <li>{t.dayMissed(sel.missed)}</li> : null}
                {selReviews ? <li>{t.dayReviews(selReviews)}</li> : null}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">{t.dayEmpty}</p>
            )}
            {sel && (sel.done || sel.due) ? (
              <DayItemsList day={selected} today={data.today} timezone={data.timezone} />
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label={t.streak} value={data.streak} sub={uz.today.days} />
        <StatTile label={t.activeDays} value={activeDays} sub={uz.today.days} />
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-(--shadow-soft) sm:p-5">
        <h2 className="mb-3 font-display text-lg font-semibold">{t.heatmapTitle}</h2>
        <ReviewHeatmap values={heat} today={data.today} label={t.heatmapTitle} />
        <p className="mt-3 text-xs text-muted-foreground">{t.historyNote}</p>
      </section>
    </div>
  );
}

const RESULT_STYLE = {
  again: "text-destructive",
  hard: "text-warning",
  good: "text-success",
  easy: "text-primary",
} as const;

/** Words behind the selected day (loaded on demand). */
function DayItemsList({ day, today, timezone }: { day: IsoDate; today: IsoDate; timezone: string }) {
  const t = uz.calendar;
  const q = useQuery({
    queryKey: ["calendar-day", day, today],
    queryFn: () => fetchDayItems(getSupabaseBrowserClient(), day, today, timezone),
  });

  if (q.isPending) return <div className="mt-3 h-16 animate-pulse rounded-lg bg-sunken" aria-busy="true" />;
  if (q.isError) {
    return (
      <p className="mt-3 text-destructive" role="alert">
        {uz.common.errorBody}
      </p>
    );
  }
  if (q.data.items.length === 0) {
    // Past days whose cards were reviewed but are now gone (deleted items).
    return day < today ? <p className="mt-3 text-muted-foreground">{t.dayItemsNone}</p> : null;
  }

  return (
    <div className="mt-3 border-t pt-3">
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {q.data.kind === "planned" ? t.dayItemsPlanned : t.dayItemsReviewed}
      </p>
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {q.data.items.map((it) => (
          <li key={it.cardId} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="font-semibold text-foreground">
                {it.direction === "en_uz" ? it.english : it.uzbek}
              </span>
              <span className="text-muted-foreground">
                {" "}
                — {it.direction === "en_uz" ? it.uzbek : it.english}
              </span>
            </span>
            {it.overdueDays > 0 ? (
              <span className="shrink-0 text-xs font-semibold text-destructive">
                {t.late(it.overdueDays)}
              </span>
            ) : it.lastResult ? (
              <span className={cn("shrink-0 text-xs font-semibold", RESULT_STYLE[it.lastResult])}>
                {t.result[it.lastResult]}
                {it.answers > 1 ? ` ×${it.answers}` : ""}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {q.data.truncated ? <p className="mt-2 text-xs text-muted-foreground">{t.dayItemsMore}</p> : null}
    </div>
  );
}
