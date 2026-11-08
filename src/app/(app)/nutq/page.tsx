import type { Metadata } from "next";
import { aiFeedbackEnabled, aiProvider } from "@/lib/ai/config";
import { PageHeader } from "@/components/common/page-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";
import { SpeakingClient } from "./speaking-client";

export const metadata: Metadata = { title: uz.nav.speaking };

export default async function SpeakingPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("settings").select("tts_rate, tts_voice").maybeSingle();

  return (
    <>
      <PageHeader title={uz.nav.speaking} description={uz.speaking.description} />
      <SpeakingClient
        ttsRate={Number(data?.tts_rate ?? 1)}
        ttsVoice={data?.tts_voice ?? null}
        aiEnabled={aiFeedbackEnabled() && aiProvider() === "gemini"}
      />
    </>
  );
}
