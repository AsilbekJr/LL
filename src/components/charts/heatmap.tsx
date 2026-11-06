"use client";

import { useMemo, useState } from "react";
import type { IsoDate } from "@/lib/srs/dates";
import { heatLevels, heatmapColumns } from "@/lib/stats/calendar";
import { formatDayUz } from "@/lib/i18n/format";

const MONTHS_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
const DAYS_SHORT = ["Du", "", "Ch", "", "Ju", "", "Ya"];
const LEVEL_BG = [
  "var(--seq-0)",
  "var(--seq-1)",
  "var(--seq-2)",
  "var(--seq-3)",
  "var(--seq-4)",
  "var(--seq-5)",
];

/**
 * 53-week review heatmap: one hue, more is darker (anchor flips in dark mode via
 * the --seq tokens). Hover/tap a cell for its value; the month calendar above is
 * the accessible day-by-day view.
 */
export function ReviewHeatmap({
  values,
  today,
  label,
}: {
  values: ReadonlyMap<IsoDate, number>;
  today: IsoDate;
  label: string;
}) {
  const columns = useMemo(() => heatmapColumns(today), [today]);
  const level = useMemo(() => heatLevels([...values.values()]), [values]);
  const [active, setActive] = useState<{ day: IsoDate; value: number } | null>(null);
  const total = [...values.values()].reduce((s, v) => s + v, 0);

  return (
    <figure className="flex flex-col gap-3">
      <div className="[scrollbar-width:thin] overflow-x-auto pb-1" dir="rtl">
        {/* rtl container keeps the most recent weeks visible on narrow screens */}
        <div
          dir="ltr"
          className="inline-flex gap-[3px]"
          role="img"
          aria-label={`${label}: jami ${total} ta takrorlash`}
        >
          <div className="mr-1 grid grid-rows-[12px_repeat(7,11px)] gap-[3px]" aria-hidden>
            <span />
            {DAYS_SHORT.map((d, i) => (
              <span key={i} className="text-[9px] leading-[11px] text-muted-foreground">
                {d}
              </span>
            ))}
          </div>
          {columns.map((week, w) => {
            const first = week[0]!;
            const showMonth = first.slice(8) <= "07" || w === 0;
            return (
              <div key={first} className="grid grid-rows-[12px_repeat(7,11px)] gap-[3px]">
                <span
                  className="text-[9px] leading-[12px] whitespace-nowrap text-muted-foreground"
                  aria-hidden
                >
                  {showMonth ? MONTHS_SHORT[Number(first.slice(5, 7)) - 1] : ""}
                </span>
                {week.map((day) => {
                  const future = day > today;
                  const v = values.get(day) ?? 0;
                  return (
                    <span
                      key={day}
                      className="size-[11px] rounded-[3px] data-[on=true]:outline-2 data-[on=true]:outline-foreground"
                      data-on={active?.day === day}
                      style={{ background: future ? "transparent" : LEVEL_BG[level(v)] }}
                      onPointerEnter={() => !future && setActive({ day, value: v })}
                      onPointerLeave={() => setActive(null)}
                      onClick={() => !future && setActive({ day, value: v })}
                      title={future ? undefined : `${formatDayUz(day)}: ${v} ta`}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite" className="min-h-4">
          {active ? (
            <>
              <span className="font-semibold text-foreground">{active.value} ta</span> ·{" "}
              {formatDayUz(active.day)}
            </>
          ) : null}
        </span>
        <span className="flex items-center gap-1" aria-hidden>
          Kam
          {LEVEL_BG.map((bg, i) => (
            <span key={i} className="size-[11px] rounded-[3px]" style={{ background: bg }} />
          ))}
          Ko&apos;p
        </span>
      </div>
    </figure>
  );
}
