import type { Metadata } from "next";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { uz } from "@/lib/i18n/uz";
import { PracticeClient } from "./practice-client";

export const metadata: Metadata = { title: uz.nav.texts };

export default async function TextPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("settings").select("tts_rate, tts_voice").maybeSingle();
  return (
    <PracticeClient id={id} speech={{ rate: Number(data?.tts_rate ?? 1), voice: data?.tts_voice ?? null }} />
  );
}
