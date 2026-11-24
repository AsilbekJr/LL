import type { Metadata } from "next";
import { aiFeedbackEnabled, aiProvider } from "@/lib/ai/config";
import { PageHeader } from "@/components/common/page-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DEFAULT_TZ, startOfDayInTz, todayInTz } from "@/lib/srs/dates";
import { uz } from "@/lib/i18n/uz";
import { RecapClient } from "./recap-client";

export const metadata: Metadata = { title: uz.recap.title };

export default async function DayRecapPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("settings").select("timezone").maybeSingle();
  const tz = data?.timezone ?? DEFAULT_TZ;
  const today = todayInTz(tz);

  return (
    <>
      <PageHeader title={uz.recap.title} description={uz.recap.description} />
      <RecapClient
        today={today}
        dayStart={startOfDayInTz(today, tz).toISOString()}
        aiEnabled={aiFeedbackEnabled() && aiProvider() === "gemini"}
      />
    </>
  );
}
