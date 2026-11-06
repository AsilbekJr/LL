"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form-controls";
import { CEFR_LEVELS, inferItemType, itemInputSchema, type ItemDraft } from "@/lib/schemas/item";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import type { VocabEntry } from "@/lib/vocab/dictionary";
import { WordAutocomplete } from "./word-autocomplete";

interface FormValues {
  english: string;
  uzbek: string;
  type: "" | ItemDraft["type"];
  cefr_level: "" | NonNullable<ItemDraft["cefr_level"]>;
  part_of_speech: string;
  example_en: string;
  example_uz: string;
  notes: string;
  tags: string;
  schedule: boolean;
}

function toValues(d?: Partial<ItemDraft>): FormValues {
  return {
    english: d?.english ?? "",
    uzbek: d?.uzbek ?? "",
    type: d?.type ?? "",
    cefr_level: d?.cefr_level ?? "",
    part_of_speech: d?.part_of_speech ?? "",
    example_en: d?.example_en ?? "",
    example_uz: d?.example_uz ?? "",
    notes: d?.notes ?? "",
    tags: d?.tags?.join(", ") ?? "",
    schedule: true,
  };
}

interface ItemFormProps {
  initial?: Partial<ItemDraft>;
  submitLabel: string;
  /** Show "add to review now" (Add page only). */
  withSchedule?: boolean;
  /** Clear the form after a successful submit (fast entry). */
  resetOnSuccess?: boolean;
  onSubmit: (draft: ItemDraft, schedule: boolean) => Promise<void>;
}

export function ItemForm({ initial, submitLabel, withSchedule, resetOnSuccess, onSubmit }: ItemFormProps) {
  const t = uz.items;
  const [showMore, setShowMore] = useState(
    Boolean(initial?.example_en || initial?.example_uz || initial?.notes || initial?.part_of_speech),
  );
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    setError,
    setValue,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: toValues(initial) });

  const english = useWatch({ control, name: "english" });
  const guessed = english.trim() ? t.types[inferItemType(english)] : null;

  // A dictionary pick fills the fields the learner has not filled yet.
  function onPick(entry: VocabEntry) {
    const opts = { shouldDirty: true, shouldValidate: false } as const;
    if (!getValues("uzbek").trim()) setValue("uzbek", entry.uzbek, opts);
    if (!getValues("cefr_level")) setValue("cefr_level", entry.level, opts);
    if (!getValues("part_of_speech").trim()) setValue("part_of_speech", entry.pos, opts);
    setFocus("uzbek");
  }

  const submit = handleSubmit(async (v) => {
    const parsed = itemInputSchema.safeParse({
      ...v,
      type: v.type || null,
      cefr_level: v.cefr_level || null,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "english" || key === "uzbek") setError(key, { message: issue.message });
      }
      return;
    }
    try {
      await onSubmit(parsed.data, withSchedule ? v.schedule : false);
      if (resetOnSuccess) {
        reset({ ...toValues(), cefr_level: v.cefr_level, tags: v.tags, schedule: v.schedule });
        setFocus("english");
      }
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : uz.common.errorBody });
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="english" label={t.english} error={errors.english?.message}>
          <Controller
            control={control}
            name="english"
            rules={{ required: t.englishRequired }}
            render={({ field }) => (
              <WordAutocomplete
                // Field cannot inject these through the Controller, so pass them here.
                id="english"
                aria-invalid={errors.english ? true : undefined}
                aria-describedby={errors.english ? "english-error" : undefined}
                autoFocus
                placeholder="break the ice"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                onPick={onPick}
              />
            )}
          />
        </Field>
        <Field id="uzbek" label={t.uzbek} error={errors.uzbek?.message}>
          <Input
            autoComplete="off"
            lang="uz"
            placeholder="muzni eritmoq"
            {...register("uzbek", { required: t.uzbekRequired })}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="type" label={t.type} hint={guessed ? t.autoType(guessed) : undefined}>
          <Select {...register("type")}>
            <option value="">{t.auto}</option>
            <option value="word">{t.types.word}</option>
            <option value="phrase">{t.types.phrase}</option>
            <option value="sentence">{t.types.sentence}</option>
          </Select>
        </Field>
        <Field id="cefr_level" label={t.level} optional>
          <Select {...register("cefr_level")}>
            <option value="">—</option>
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="tags" label={t.tags} hint={t.tagsHint} optional>
          <Input autoComplete="off" autoCapitalize="none" placeholder="travel, work" {...register("tags")} />
        </Field>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          aria-expanded={showMore}
          aria-controls="item-more"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronDown className={cn("size-4 transition-transform", showMore && "rotate-180")} aria-hidden />
          {t.more}
        </button>
        <div id="item-more" hidden={!showMore} className="mt-4 grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="example_en" label={t.exampleEn} optional>
              <Textarea
                rows={2}
                lang="en"
                placeholder="Let me break the ice with a joke."
                {...register("example_en")}
              />
            </Field>
            <Field id="example_uz" label={t.exampleUz} optional>
              <Textarea rows={2} lang="uz" {...register("example_uz")} />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
            <Field id="part_of_speech" label={t.pos} optional>
              <Input autoComplete="off" placeholder="verb, noun…" {...register("part_of_speech")} />
            </Field>
            <Field id="notes" label={t.notes} optional>
              <Textarea rows={2} {...register("notes")} />
            </Field>
          </div>
        </div>
      </div>

      {withSchedule ? (
        <Checkbox label={t.scheduleNow} description={t.scheduleNowHint} {...register("schedule")} />
      ) : null}

      {errors.root?.message ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive"
        >
          {errors.root.message}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-auto sm:self-start">
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {submitLabel}
      </Button>
    </form>
  );
}
