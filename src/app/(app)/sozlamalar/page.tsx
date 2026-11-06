import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";
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
        <SettingsForm initial={data} vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null} />
      )}
    </>
  );
}
