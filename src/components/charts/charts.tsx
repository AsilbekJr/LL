"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { niceMax } from "@/lib/stats/calendar";

/* Chart specs follow the dataviz skill: bars ≤24px with a 4px rounded data
   end (square at the baseline), hairline recessive grid, one hue for a
   single series (no legend box), per-mark hover/focus tooltip, a table view,
   text in text tokens (never in the series color). */

// ---------- stat tile ----------------------------------------------------------

export function StatTile({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-(--shadow-soft)", className)}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-3xl leading-none font-semibold">{value}</p>
      {sub ? <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

// ---------- column chart (single series) -----------------------------------

export interface Column {
  key: string;
  /** Short axis label (shown sparsely). */
  label: string;
  /** Full label for tooltip / table. */
  fullLabel: string;
  value: number;
}

export function ColumnChart({
  data,
  title,
  unit,
  height = 160,
  emphasizeLast,
  tableCaption,
}: {
  data: Column[];
  title: string;
  /** Formats a value for tooltip/table, e.g. n => `${n} ta`. */
  unit: (n: number) => string;
  height?: number;
  emphasizeLast?: boolean;
  tableCaption?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0);
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative" style={{ height: height + 22 }}>
        {/* y ticks + hairline grid (0, half, max) */}
        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }} aria-hidden>
          {[1, 0.5, 0].map((f) => (
            <div
              key={f}
              className="absolute inset-x-0 flex items-center gap-2"
              style={{ top: (1 - f) * height - 6 }}
            >
              <span className="w-7 text-right text-[10px] text-muted-foreground tabular-nums">
                {Math.round(max * f)}
              </span>
              <span className="h-px flex-1 bg-(--chart-grid)" />
            </div>
          ))}
        </div>

        <div
          className="absolute top-0 right-0 left-9 flex items-end gap-[2px]"
          style={{ height }}
          role="group"
          aria-label={title}
          aria-describedby={tableId}
          onPointerLeave={() => setActive(null)}
        >
          {data.map((d, i) => {
            const h = max ? (d.value / max) * height : 0;
            const strong = emphasizeLast ? i === data.length - 1 : true;
            return (
              <button
                key={d.key}
                type="button"
                aria-label={`${d.fullLabel}: ${unit(d.value)}`}
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="group relative flex h-full flex-1 items-end justify-center outline-none focus-visible:bg-sunken/70"
              >
                <span
                  className={cn(
                    "w-full max-w-6 rounded-t-[4px] transition-[filter]",
                    strong ? "bg-(--seq-4)" : "bg-(--seq-2)",
                    active === i && "brightness-110",
                  )}
                  style={{ height: d.value > 0 ? Math.max(2, h) : 0 }}
                />
                {/* direct label on the peak only */}
                {i === peak && d.value > 0 && active === null ? (
                  <span
                    className="absolute text-[10px] font-semibold text-foreground tabular-nums"
                    style={{ bottom: h + 2 }}
                    aria-hidden
                  >
                    {d.value}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* x labels (sparse) */}
        <div className="absolute right-0 bottom-0 left-9 flex gap-[2px]" aria-hidden>
          {data.map((d, i) => (
            <span key={d.key} className="flex-1 truncate text-center text-[10px] text-muted-foreground">
              {i % labelEvery === 0 || i === data.length - 1 ? d.label : ""}
            </span>
          ))}
        </div>

        {active !== null && data[active] ? (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-(--shadow-lift)"
            style={{ left: `calc(2.25rem + (100% - 2.25rem) * ${(active + 0.5) / data.length})` }}
          >
            <span className="block font-semibold text-foreground">{unit(data[active].value)}</span>
            <span className="text-muted-foreground">{data[active].fullLabel}</span>
          </div>
        ) : null}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Jadval ko&apos;rinishi
        </summary>
        <table id={tableId} className="mt-2 w-full text-left">
          <caption className="sr-only">{tableCaption ?? title}</caption>
          <tbody>
            {data.map((d) => (
              <tr key={d.key} className="border-b last:border-0">
                <th scope="row" className="py-1 font-normal text-muted-foreground">
                  {d.fullLabel}
                </th>
                <td className="py-1 text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

// ---------- segmented bar (parts of a whole) ---------------------------------

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** CSS color (a categorical token). */
  color: string;
  /** Label text color inside the block: white, or near-black on light hues. */
  ink: "light" | "dark";
}

export function SegmentedBar({ segments, title }: { segments: Segment[]; title: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <figure className="flex flex-col gap-3">
      <div
        className="flex h-7 gap-[2px] overflow-hidden"
        role="img"
        aria-label={`${title}: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
      >
        {total === 0 ? <div className="h-full flex-1 rounded-[4px] bg-sunken" /> : null}
        {visible.map((s) => {
          const share = s.value / total;
          return (
            <div
              key={s.key}
              className="flex h-full min-w-[3px] items-center rounded-[4px] px-2 text-xs font-semibold"
              style={{
                flexGrow: s.value,
                flexBasis: 0,
                background: s.color,
                color: s.ink === "light" ? "#ffffff" : "#0b0b0b",
              }}
              title={`${s.label}: ${s.value} (${Math.round(share * 100)}%)`}
            >
              {share >= 0.12 ? `${Math.round(share * 100)}%` : null}
            </div>
          );
        })}
      </div>
      {/* legend doubles as the value table (relief for low-contrast hues) */}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
