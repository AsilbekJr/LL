import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Flame, Play, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_TZ, todayInTz } from "@/lib/srs/dates";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: uz.nav.today };

const STUDIED = ["learning", "review", "mastered"] as const;

async function getCounts() {
  const supabase = await getSupabaseServerClient();
  const { data: settings } = await supabase.from("settings").select("timezone").maybeSingle();
  const today = todayInTz(settings?.timezone ?? DEFAULT_TZ);

  const base = () => supabase.from("cards").select("id", { count: "exact", head: true });
  const [due, overdue, fresh] = await Promise.all([
    base().in("status", [...STUDIED]).lte("due_date", today),
    base().in("status", [...STUDIED]).lt("due_date", today),
    base().eq("status", "new"),
  ]);

  const error = due.error ?? overdue.error ?? fresh.error;
  return { error, due: due.count ?? 0, overdue: overdue.count ?? 0, fresh: fresh.count ?? 0 };
}

export default async function TodayPage() {
  const { error, due, overdue, fresh } = await getCounts();

  if (error) {
    return (
      <>
        <PageHeader title={uz.nav.today} />
        <EmptyState icon={AlertTriangle} title={uz.common.errorTitle} description={uz.common.errorBody} />
      </>
    );
  }

  const nothing = due === 0 && fresh === 0;

  return (
    <>
      <PageHeader title={uz.nav.today} description="Bugungi takrorlashlar" />

      {overdue > 0 ? (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {overdue} ta kechikkan takrorlash bor — ular birinchi ko&apos;rsatiladi.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Takrorlash" value={due} icon={CalendarClock} />
        <Stat label="Kechikkan" value={overdue} icon={AlertTriangle} tone={overdue > 0 ? "danger" : undefined} />
        <Stat label="Yangi" value={fresh} icon={Sparkles} />
        <Stat label="Streak" value={0} icon={Flame} hint="2-fazada" />
      </div>

      <div className="mt-6">
        {nothing ? (
          <EmptyState
            icon={Sparkles}
            title="Bugun takrorlash yo'q"
            description="Yangi so'z qo'shing yoki tayyor to'plamni import qiling."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/qoshish">So&apos;z qo&apos;shish</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/import">Import</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <Button size="lg" className="w-full text-lg" disabled aria-describedby="start-hint">
            <Play className="size-5" aria-hidden />
            Boshlash
          </Button>
        )}
        {!nothing ? (
          <p id="start-hint" className="mt-2 text-center text-xs text-muted-foreground">
            {uz.common.comingInPhase(4)}
          </p>
        ) : null}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: number;
  icon: typeof Flame;
  tone?: "danger";
  hint?: string;
}) {
  return (
    <Card className={cn(tone === "danger" && "border-destructive/40")}>
      <CardContent className="flex flex-col gap-1 p-4">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          {label}
        </span>
        <span className={cn("text-3xl font-bold tabular-nums", tone === "danger" && "text-destructive")}>
          {value}
        </span>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}
