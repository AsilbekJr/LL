import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Upload } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";
import { ResetData } from "./reset-data";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: uz.nav.settings };

export default async function SettingsPage() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("settings").select("*").maybeSingle();

  return (
    <>
      <PageHeader title={uz.nav.settings} description={uz.settings.description} />
      {error || !data ? (
        <EmptyState icon={AlertTriangle} title={uz.common.errorTitle} description={uz.common.errorBody} />
      ) : (
        <div className="flex flex-col gap-5 pb-24">
          <SettingsForm initial={data} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
          {/* Import / backup: needed rarely, so it lives here, not in the menu. */}
          <Link
            href="/import"
            className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-(--shadow-soft) outline-none hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
              <Upload className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{uz.settings.importTitle}</span>
              <span className="block text-sm text-muted-foreground">{uz.settings.importBody}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
          <ResetData />
        </div>
      )}
    </>
  );
}
