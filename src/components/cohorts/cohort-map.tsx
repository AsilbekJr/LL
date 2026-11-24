import { CalendarDays, CalendarRange } from "lucide-react";
import { addDays, type IsoDate } from "@/lib/srs/dates";
import type { Cohort, CohortChip } from "@/lib/srs/cohorts";
import { formatShortDayUz } from "@/lib/i18n/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const t = uz.cohorts;

/** "Bugun yangi", "Kecha", "17-noyabr" or "8-noyabr – 15-noyabr" for a merged row. */
export function cohortDayLabel(day: IsoDate | null, today: IsoDate, fromDay: IsoDate | null = day): string {
  if (day === null) return t.unknown;
  if (day === today) return t.today;
  const label = day === addDays(today, -1) ? t.yesterday : formatShortDayUz(day);
  return fromDay && fromDay !== day ? `${formatShortDayUz(fromDay)} – ${label}` : label;
}

function repetitionLabel(rep: number): string {
  return rep === 0 ? t.first : t.repetition(rep);
}

/** Today's words by first-study day: how many, which review, what is late. */
export function CohortMap({ cohorts, today }: { cohorts: Cohort[]; today: IsoDate }) {
  if (cohorts.length === 0) return null;
  const words = cohorts.reduce((s, c) => s + c.today, 0);
  const days = cohorts.reduce((s, c) => s + c.days, 0);

  return (
    <section
      aria-labelledby="cohort-map-title"
      className="mt-3 rounded-xl border bg-card p-4 shadow-(--shadow-soft)"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="cohort-map-title"
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
        >
          <CalendarRange className="size-3.5" aria-hidden />
          {t.mapTitle}
        </h2>
        <p className="text-xs font-semibold text-muted-foreground tabular-nums">
          {t.mapSummary(words, days)}
        </p>
      </div>

      <ol className="mt-2 divide-y">
        {cohorts.map((c) => {
          const notes = [
            c.minRepetition !== c.maxRepetition && c.minRepetition > 0
              ? t.range(c.minRepetition, c.maxRepetition)
              : "",
            c.overdue ? t.overdue(c.overdue) : "",
            c.relearning ? t.relearning(c.relearning) : "",
          ].filter(Boolean);
          return (
            <li key={`${c.day}:${c.fromDay}`} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{cohortDayLabel(c.day, today, c.fromDay)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t.ofTotal(c.today, c.total)}
                    {notes.length ? (
                      <span className={cn((c.overdue || c.relearning) && "text-warning")}>
                        {" "}
                        · {notes.join(" · ")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                    c.repetition === 0
                      ? "bg-highlight-soft text-highlight-foreground"
                      : "bg-primary-soft text-primary-soft-foreground",
                  )}
                >
                  {repetitionLabel(c.repetition)}
                </span>
              </div>
              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"
                role="img"
                aria-label={t.ofTotal(c.today, c.total)}
              >
                <div
                  className={cn("h-full rounded-full", c.repetition === 0 ? "bg-highlight" : "bg-primary")}
                  style={{ width: `${Math.max(4, Math.round((c.today / Math.max(1, c.total)) * 100))}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">{t.mapHint}</p>
    </section>
  );
}

/** Small line above a card in the session: its day, its review number, its place. */
export function CohortChipView({ chip, today }: { chip: CohortChip; today: IsoDate }) {
  return (
    <p
      className="mx-auto inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground tabular-nums shadow-(--shadow-soft)"
      aria-label={t.chipLabel}
    >
      <CalendarDays className="size-3.5" aria-hidden />
      <span className="text-foreground">{cohortDayLabel(chip.day, today)}</span>
      <span aria-hidden>·</span>
      <span>{repetitionLabel(chip.repetition)}</span>
      {chip.size > 1 ? (
        <>
          <span aria-hidden>·</span>
          <span>{t.chipPlace(chip.index, chip.size)}</span>
        </>
      ) : null}
    </p>
  );
}
