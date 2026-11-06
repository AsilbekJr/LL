"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { ColumnChart, SegmentedBar, StatTile, type Column, type Segment } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { activeCount, spokenDays } from "@/lib/production/active";
import { fetchSpokenUses } from "@/lib/production/api";
import { fetchStats } from "@/lib/stats/api";
import { denseSeries } from "@/lib/stats/calendar";
import { addDays, type IsoDate } from "@/lib/srs/dates";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDayUz } from "@/lib/i18n/format";
import { uz } from "@/lib/i18n/uz";

const short = (d: IsoDate) => `${Number(d.slice(8))}.${d.slice(5, 7)}`;

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-(--shadow-soft) sm:p-5">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function StatsClient() {
  const t = uz.stats;
  const q = useQuery({ queryKey: ["stats"], queryFn: () => fetchStats(getSupabaseBrowserClient()) });
  const uses = useQuery({
    queryKey: ["spoken-uses"],
    queryFn: () => fetchSpokenUses(getSupabaseBrowserClient()),
  });
  const active = useMemo(() => (uses.data ? activeCount(spokenDays(uses.data)) : null), [uses.data]);

  const charts = useMemo(() => {
    if (!q.data) return null;
    const d = q.data;
    const reviewsMap = new Map<IsoDate, number>();
    for (const [day, s] of d.history) reviewsMap.set(day, s.reviews);
    reviewsMap.set(d.today, d.todayReviews);
    const reviews: Column[] = denseSeries(reviewsMap, d.today, 30).map((p) => ({
      key: p.day,
      label: short(p.day),
      fullLabel: formatDayUz(p.day),
      value: p.value,
    }));
    const forecast: Column[] = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(d.today, i);
      return {
        key: day,
        label: short(day),
        fullLabel: formatDayUz(day),
        value: i === 0 ? d.todayDue : (d.forecast.get(day) ?? 0),
      };
    });
    const s = d.statusCounts;
    // Categorical slots in fixed order (validated palette); ink by fill luminance.
    const status: Segment[] = [
      { key: "new", label: uz.items.status.new, value: s.new, color: "var(--series-1)", ink: "light" },
      { key: "learning", label: "O'rganilmoqda", value: s.learning, color: "var(--series-2)", ink: "light" },
      { key: "review", label: "Takrorlanmoqda", value: s.review, color: "var(--series-3)", ink: "light" },
      {
        key: "mastered",
        label: uz.items.status.mastered,
        value: s.mastered,
        color: "var(--series-4)",
        ink: "dark",
      },
      {
        key: "suspended",
        label: uz.items.status.suspended,
        value: s.suspended,
        color: "var(--series-5)",
        ink: "light",
      },
    ];
    return { reviews, forecast, status };
  }, [q.data]);

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-sunken" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-sunken" />
      </div>
    );
  }
  if (q.isError || !charts) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={uz.common.errorTitle}
        description={uz.common.errorBody}
        action={<Button onClick={() => q.refetch()}>{uz.common.retry}</Button>}
      />
    );
  }

  const d = q.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={t.items} value={d.items.toLocaleString("en-US")} />
        <StatTile label={t.mastered} value={d.statusCounts.mastered.toLocaleString("en-US")} sub={t.cards} />
        <StatTile
          label={t.accuracy}
          value={d.accuracy30 === null ? t.noData : `${Math.round(d.accuracy30 * 100)}%`}
          sub={d.reviews30 ? t.accuracySub(d.reviews30) : undefined}
        />
        <StatTile label={t.streak} value={d.streak} sub={uz.today.days} />
        <StatTile label={t.studyTime} value={t.minutes(d.studySeconds7)} />
        <StatTile label={t.speakingTime} value={t.minutes(d.speakingSeconds7)} />
        <StatTile
          label={uz.speaking.activeTitle}
          value={active === null ? "—" : active.toLocaleString("en-US")}
          sub={t.activeSub}
        />
      </div>

      <Card title={t.reviewsTitle}>
        <ColumnChart
          data={charts.reviews}
          title={t.reviewsTitle}
          unit={t.reviewsUnit}
          emphasizeLast={false}
        />
      </Card>

      <Card title={t.forecastTitle} sub={t.forecastSub}>
        <ColumnChart data={charts.forecast} title={t.forecastTitle} unit={t.cardsUnit} height={130} />
      </Card>

      <Card title={t.statusTitle}>
        <SegmentedBar segments={charts.status} title={t.statusTitle} />
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card title={t.productionsTitle}>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">{t.written}</dt>
              <dd className="text-2xl font-semibold">{d.productions.written}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-muted-foreground">{t.spoken}</dt>
              <dd className="text-2xl font-semibold">{d.productions.spoken}</dd>
            </div>
          </dl>
        </Card>
        <Card title={t.hardestTitle}>
          {d.hardest.length ? (
            <ol className="flex flex-col gap-2">
              {d.hardest.map((h, i) => (
                <li key={`${h.english}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold" lang="en">
                      {h.english}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{h.uzbek}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t.lapses(h.lapses)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{t.hardestEmpty}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
