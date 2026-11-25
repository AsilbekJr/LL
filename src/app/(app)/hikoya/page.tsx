import type { Metadata } from "next";
import { aiFeedbackEnabled, aiProvider } from "@/lib/ai/config";
import { PageHeader } from "@/components/common/page-header";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { addDays, DEFAULT_TZ, startOfDayInTz, todayInTz } from "@/lib/srs/dates";
import { daysUntilStory, storyWeek } from "@/lib/story/story";
import { uz } from "@/lib/i18n/uz";
import { StoryClient } from "./story-client";

export const metadata: Metadata = { title: uz.nav.story };

export default async function WeeklyStoryPage() {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("settings").select("timezone, tts_rate, tts_voice").maybeSingle();
  const tz = data?.timezone ?? DEFAULT_TZ;
  const today = todayInTz(tz);
  const week = storyWeek(today);

  return (
    <>
      <PageHeader title={uz.nav.story} description={uz.story.description} />
      <StoryClient
        weekStart={week.weekStart}
        current={week.current}
        opensIn={week.current ? 0 : daysUntilStory(today)}
        from={startOfDayInTz(week.weekStart, tz).toISOString()}
        to={startOfDayInTz(addDays(week.weekStart, 7), tz).toISOString()}
        aiEnabled={aiFeedbackEnabled() && aiProvider() === "gemini"}
        speech={{ rate: Number(data?.tts_rate ?? 1), voice: data?.tts_voice ?? null }}
      />
    </>
  );
}
