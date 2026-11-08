"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BottomActionBar } from "@/components/common/bottom-action-bar";
import { useFieldArray, useForm, useFormState, useWatch } from "react-hook-form";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Volume2, X } from "lucide-react";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Notice, Select } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { MAX_REMINDERS, settingsFormSchema } from "@/lib/schemas/settings";
import { englishVoices, testDeviceVoice, type VoiceTestResult } from "@/lib/speech/tts";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { uz } from "@/lib/i18n/uz";
import { PushToggle } from "./push-toggle";

interface FormValues {
  daily_new_limit: string;
  daily_review_limit: string;
  ladder: string;
  srs_mode: "ladder" | "fsrs";
  direction_mode: "random" | "en_uz" | "uz_en" | "both";
  overdue_penalty: boolean;
  production_gate_steps: string;
  maintenance_days: string;
  tts_rate: string;
  tts_voice: string;
  timezone: string;
  reminder_times: { value: string }[];
}

function toValues(s: Tables<"settings">): FormValues {
  return {
    daily_new_limit: String(s.daily_new_limit),
    daily_review_limit: String(s.daily_review_limit),
    ladder: s.ladder.join(", "),
    srs_mode: s.srs_mode,
    direction_mode: s.direction_mode,
    overdue_penalty: s.overdue_penalty,
    production_gate_steps: String(s.production_gate_steps),
    maintenance_days: String(s.maintenance_days),
    tts_rate: String(s.tts_rate),
    tts_voice: s.tts_voice ?? "",
    timezone: s.timezone,
    reminder_times: s.reminder_times.map((t) => ({ value: t.slice(0, 5) })),
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-soft) sm:p-6">
      <h2 className="mb-5 font-display text-xl font-semibold">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function SettingsForm({
  initial,
  vapidPublicKey,
}: {
  initial: Tables<"settings">;
  vapidPublicKey: string | null;
}) {
  const t = uz.settings;
  const formId = useId();
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceTest, setVoiceTest] = useState<"busy" | VoiceTestResult | null>(null);
  const timeZones = useMemo(() => {
    const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    return all.includes(initial.timezone) ? all : [initial.timezone, ...all];
  }, [initial.timezone]);

  const { register, control, handleSubmit, setError, reset } = useForm<FormValues>({
    defaultValues: toValues(initial),
  });
  // Explicit subscription: reading these from useForm's formState did not
  // re-render this form, so "Saqlash" stayed disabled after every edit.
  const { errors, isSubmitting, isDirty } = useFormState({ control });
  // Server-rendered inputs need their value in the HTML: register() only fills
  // them after hydration, and a blank field read (or saved) before that
  // turned "Kuniga yangi so'zlar" into 0.
  const defaults = toValues(initial);
  const field = <K extends Exclude<keyof FormValues, "reminder_times" | "overdue_penalty">>(name: K) => ({
    ...register(name),
    defaultValue: defaults[name] as string,
  });
  const reminders = useFieldArray({ control, name: "reminder_times" });
  const ttsRate = useWatch({ control, name: "tts_rate" });
  const ttsVoice = useWatch({ control, name: "tts_voice" });

  useEffect(() => {
    let alive = true;
    void englishVoices().then((v) => alive && setVoices(v));
    return () => {
      alive = false;
    };
  }, []);

  const onSubmit = handleSubmit(async (v) => {
    setMessage(null);
    const parsed = settingsFormSchema.safeParse({
      ...v,
      reminder_times: v.reminder_times.map((r) => r.value),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && key in v)
          setError(key as keyof FormValues, { message: issue.message });
      }
      return;
    }
    const { error } = await getSupabaseBrowserClient()
      .from("settings")
      .update(parsed.data)
      .eq("user_id", initial.user_id);
    if (error) {
      setMessage({ tone: "danger", text: error.message });
      return;
    }
    reset({ ...v, reminder_times: parsed.data.reminder_times.map((value) => ({ value })) });
    setMessage({ tone: "success", text: t.saved });
    router.refresh();
  });

  const reminderError = (errors.reminder_times as { message?: string } | undefined)?.message;

  return (
    <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <Section title={t.plan}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="daily_new_limit"
            label={t.newLimit}
            hint={t.newLimitHint}
            error={errors.daily_new_limit?.message}
          >
            <Input type="number" inputMode="numeric" min={0} max={500} {...field("daily_new_limit")} />
          </Field>
          <Field id="daily_review_limit" label={t.reviewLimit} error={errors.daily_review_limit?.message}>
            <Input type="number" inputMode="numeric" min={1} max={2000} {...field("daily_review_limit")} />
          </Field>
        </div>
        <Field id="direction_mode" label={t.direction}>
          <Select {...field("direction_mode")}>
            {(Object.keys(t.directions) as (keyof typeof t.directions)[]).map((k) => (
              <option key={k} value={k}>
                {t.directions[k]}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title={t.algorithm}>
        <Field id="srs_mode" label={t.srsMode}>
          <Select {...field("srs_mode")}>
            <option value="ladder">{t.srsModes.ladder}</option>
            <option value="fsrs">{t.srsModes.fsrs}</option>
          </Select>
        </Field>
        <Field id="ladder" label={t.ladder} hint={t.ladderHint} error={errors.ladder?.message}>
          <Input inputMode="numeric" autoComplete="off" {...field("ladder")} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="production_gate_steps"
            label={t.gateSteps}
            hint={t.gateStepsHint}
            error={errors.production_gate_steps?.message}
          >
            <Input type="number" inputMode="numeric" min={0} max={30} {...field("production_gate_steps")} />
          </Field>
          <Field id="maintenance_days" label={t.maintenance} error={errors.maintenance_days?.message}>
            <Input type="number" inputMode="numeric" min={30} max={3650} {...field("maintenance_days")} />
          </Field>
        </div>
        <Checkbox
          label={t.overduePenalty}
          description={t.overduePenaltyHint}
          defaultChecked={defaults.overdue_penalty}
          {...register("overdue_penalty")}
        />
      </Section>

      <Section title={t.voice}>
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <Field id="tts_voice" label={t.ttsVoice} hint={voices.length ? undefined : t.noVoices}>
            <Select {...field("tts_voice")}>
              <option value="">{t.ttsVoiceDefault}</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </Select>
          </Field>
          <Field id="tts_rate" label={`${t.ttsRate}: ${Number(ttsRate).toFixed(2)}×`}>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              // Without an explicit value the server-rendered slider sits at
              // the middle of its range (1.25×), and the form adopted that:
              // the speed silently changed and "Saqlash" never enabled.
              defaultValue={String(initial.tts_rate)}
              className="h-12 w-full accent-primary"
              {...register("tts_rate")}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            disabled={voiceTest === "busy"}
            onClick={async () => {
              setVoiceTest("busy");
              setVoiceTest(
                await testDeviceVoice(t.ttsSample, { rate: Number(ttsRate), voice: ttsVoice || null }),
              );
            }}
          >
            {voiceTest === "busy" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Volume2 aria-hidden />
            )}
            {t.ttsTest}
          </Button>
          {voiceTest && voiceTest !== "busy" ? (
            <div role="status" className="text-sm text-muted-foreground">
              <p>
                {voiceTest.engine === "device"
                  ? t.ttsEngineDevice
                  : voiceTest.engine === "server"
                    ? t.ttsEngineServer
                    : t.ttsEngineNone(voiceTest.error ?? "")}
              </p>
              <p className="mt-1 font-mono text-xs">
                {voiceTest.info}
                {voiceTest.error ? ` · ${voiceTest.error}` : ""}
              </p>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title={t.reminders}>
        <PushToggle vapidPublicKey={vapidPublicKey} />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{t.reminderTimes}</p>
          <ul className="flex flex-wrap gap-2">
            {reminders.fields.map((f, i) => (
              <li key={f.id} className="flex items-center gap-1">
                <Input
                  type="time"
                  aria-label={`${t.reminderTimes} ${i + 1}`}
                  className="h-11 w-32"
                  defaultValue={f.value}
                  {...register(`reminder_times.${i}.value`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t.removeReminder}
                  onClick={() => reminders.remove(i)}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {reminders.fields.length < MAX_REMINDERS ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => reminders.append({ value: "12:00" })}
            >
              <Plus aria-hidden />
              {t.addReminder}
            </Button>
          ) : null}
          {reminderError ? <p className="text-sm font-medium text-destructive">{reminderError}</p> : null}
        </div>
      </Section>

      <Section title={t.time}>
        <Field id="timezone" label={t.timezone} hint={t.timezoneHint} error={errors.timezone?.message}>
          <Select {...field("timezone")}>
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section title={t.appearance}>
        <div className="max-w-xs">
          <ThemeToggle />
        </div>
      </Section>

      {message ? (
        <Notice tone={message.tone} icon={message.tone === "success" ? CheckCircle2 : AlertTriangle}>
          {message.text}
        </Notice>
      ) : null}

      {/* Pinned to the bottom of the screen, so saving never needs scrolling. */}
      <BottomActionBar label={t.save}>
        <Button type="submit" form={formId} size="lg" className="w-full" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t.save}
        </Button>
      </BottomActionBar>
    </form>
  );
}
