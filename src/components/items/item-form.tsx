"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Controller, useForm, useWatch, useFormState } from "react-hook-form";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { BottomActionBar } from "@/components/common/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/form-controls";
import {
  aiDetails,
  aiLookup,
  findEntry,
  localDetails,
  mergeDetails,
  wantsDetails,
  type Details,
} from "@/lib/items/enrich";
import { CEFR_LEVELS, inferItemType, itemInputSchema, type ItemDraft } from "@/lib/schemas/item";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { loadAll, type VocabEntry } from "@/lib/vocab/dictionary";
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
  /** Look `initial.english` up in the dictionary on open and fill the rest (shared words). */
  lookupInitial?: boolean;
  submitLabel: string;
  /** Show "add to review now" (Add page only). */
  withSchedule?: boolean;
  /** Clear the form after a successful submit (fast entry). */
  resetOnSuccess?: boolean;
  onSubmit: (draft: ItemDraft, schedule: boolean) => Promise<void>;
  /**
   * Picking a dictionary word fills example (EN + UZ), part of speech and
   * note automatically; `ai` adds Gemini on top of the offline sources.
   */
  autoDetails?: { ai: boolean };
  /** Keep the submit button pinned to the bottom of the screen (Add page). */
  stickySubmit?: boolean;
}

type DetailField = "part_of_speech" | "example_en" | "example_uz" | "notes";
const DETAIL_FIELDS: DetailField[] = ["part_of_speech", "example_en", "example_uz", "notes"];

export function ItemForm({
  initial,
  submitLabel,
  withSchedule,
  resetOnSuccess,
  onSubmit,
  autoDetails,
  stickySubmit,
  lookupInitial,
}: ItemFormProps) {
  const t = uz.items;
  const formId = useId();
  const [filling, setFilling] = useState<"idle" | "busy" | "done">("idle");
  // Values this form filled in itself: a later, better source may replace
  // them, but never a value the learner typed.
  const autoValues = useRef<Partial<Record<DetailField, string>>>({});
  const fillRun = useRef(0);
  const pendingFill = useRef<Promise<void> | null>(null);
  const [showMore, setShowMore] = useState(
    Boolean(initial?.example_en || initial?.example_uz || initial?.notes || initial?.part_of_speech),
  );
  const { register, handleSubmit, reset, setFocus, setError, setValue, getValues, control } =
    useForm<FormValues>({ defaultValues: toValues(initial) });
  const { errors, isSubmitting } = useFormState({ control });

  const english = useWatch({ control, name: "english" });
  const guessed = english.trim() ? t.types[inferItemType(english)] : null;

  // A dictionary pick fills the fields the learner has not filled yet.
  function onPick(entry: VocabEntry) {
    const opts = { shouldDirty: true, shouldValidate: false } as const;
    if (!getValues("uzbek").trim()) setValue("uzbek", entry.uzbek, opts);
    if (!getValues("cefr_level")) setValue("cefr_level", entry.level, opts);
    if (!getValues("part_of_speech").trim()) setValue("part_of_speech", entry.pos, opts);
    if (autoDetails && wantsDetails(entry)) {
      setShowMore(true);
      pendingFill.current = fillDetails(entry);
    }
    setFocus("uzbek");
  }

  /** A detail field may be (re)filled if it is empty or still holds our own auto value. */
  function fillable(name: DetailField): boolean {
    const v = getValues(name);
    return !v.trim() || v === autoValues.current[name];
  }

  function apply(details: Details, ai?: Parameters<typeof mergeDetails>[2]) {
    const current = Object.fromEntries(
      DETAIL_FIELDS.map((f) => [f, fillable(f) ? "" : getValues(f)]),
    ) as Record<DetailField, string>;
    const merged = mergeDetails(current, details, ai);
    for (const f of DETAIL_FIELDS) {
      const v = merged[f];
      if (!fillable(f) || typeof v !== "string" || !v) continue;
      setValue(f, v, { shouldDirty: true });
      autoValues.current[f] = v;
    }
  }

  async function fillDetails(entry: VocabEntry): Promise<void> {
    const run = ++fillRun.current;
    setFilling("busy");
    try {
      const src = { english: entry.english, uzbek: getValues("uzbek"), cefr_level: entry.level };
      const local = await localDetails(src, entry);
      if (run !== fillRun.current) return;
      apply(local);
      if (autoDetails?.ai) {
        const ai = await aiDetails([{ src: { ...src, uzbek: getValues("uzbek") }, local }]);
        if (run !== fillRun.current) return;
        apply(local, ai.values().next().value ?? null);
      }
    } catch {
      // best effort: the learner can still fill the fields by hand
    } finally {
      if (run === fillRun.current) setFilling("done");
    }
  }

  /**
   * The learner typed a word and moved on without picking a suggestion: fill
   * the rest anyway. A dictionary word is treated like a pick; a word the
   * dictionary does not have ("puddle") is translated by AI. Never overwrites
   * a translation the learner typed.
   */
  const lastLookup = useRef("");
  const autoUzbek = useRef("");
  const [translating, setTranslating] = useState<"idle" | "busy" | "ai" | "none">("idle");
  const uzbekFree = () => !getValues("uzbek").trim() || getValues("uzbek") === autoUzbek.current;

  async function lookupTyped(): Promise<void> {
    const word = getValues("english").trim();
    if (!autoDetails || word.length < 2 || word.length > 120 || !uzbekFree()) return;
    if (word.toLowerCase() === lastLookup.current) return;
    lastLookup.current = word.toLowerCase();
    const same = () => getValues("english").trim() === word && uzbekFree();

    const entry = findEntry(word, await loadAll().catch(() => []));
    if (!same()) return;
    if (entry) {
      setTranslating("idle");
      autoUzbek.current = "";
      setValue("uzbek", "", { shouldDirty: true });
      onPick(entry);
      return;
    }
    if (!autoDetails.ai) return;
    setTranslating("busy");
    const run = ++fillRun.current;
    const found = await aiLookup(word).catch(() => null);
    if (run !== fillRun.current || !same()) {
      if (run === fillRun.current) setTranslating("idle");
      return;
    }
    if (!found) {
      setTranslating("none");
      return;
    }
    const uzbek = found.uzbek.trim();
    autoUzbek.current = uzbek;
    setValue("uzbek", uzbek, { shouldDirty: true, shouldValidate: true });
    const level = CEFR_LEVELS.find((l) => l === found.level.trim().toUpperCase());
    if (level && !getValues("cefr_level")) setValue("cefr_level", level, { shouldDirty: true });
    if (wantsDetails({ english: word })) {
      setShowMore(true);
      apply({}, found);
      setFilling("done");
    }
    setTranslating("ai");
  }

  // A word that came in from outside (share sheet): treat a dictionary match
  // exactly like a pick from the suggestions; otherwise go on to the translation.
  const lookedUp = useRef(false);
  useEffect(() => {
    const word = initial?.english?.trim();
    if (!lookupInitial || !word || lookedUp.current) return;
    lookedUp.current = true;
    void loadAll()
      .catch(() => [])
      .then((entries) => {
        const entry = getValues("english").trim() === word ? findEntry(word, entries) : null;
        if (entry) onPick(entry);
        else {
          setFocus("uzbek");
          void lookupTyped();
        }
      });
    // Runs once for the word the form was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onValid(snapshot: FormValues) {
    // Pressed while details are still being prepared: wait for them (bounded
    // by the request timeout) so the card is saved complete.
    if (pendingFill.current) await pendingFill.current;
    const v = pendingFill.current ? getValues() : snapshot;
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
        fillRun.current++;
        pendingFill.current = null;
        autoValues.current = {};
        setFilling("idle");
        reset({ ...toValues(), cefr_level: v.cefr_level, tags: v.tags, schedule: v.schedule });
        setFocus("english");
      }
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : uz.common.errorBody });
    }
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => void handleSubmit(onValid)(e)}
      noValidate
      className="flex flex-col gap-5"
    >
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
                onBlur={() => {
                  field.onBlur();
                  // After a tap on a suggestion the pick has already filled the form.
                  window.setTimeout(() => {
                    if (uzbekFree()) pendingFill.current = lookupTyped();
                  }, 300);
                }}
                inputRef={field.ref}
                onPick={onPick}
              />
            )}
          />
        </Field>
        <Field
          id="uzbek"
          label={t.uzbek}
          error={errors.uzbek?.message}
          hint={
            translating === "busy"
              ? uz.add.translating
              : translating === "ai"
                ? uz.add.translatedByAi
                : translating === "none"
                  ? uz.add.translateNone
                  : undefined
          }
        >
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
        {filling !== "idle" ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            {filling === "busy" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4 text-primary" aria-hidden />
            )}
            {filling === "busy" ? uz.add.filling : uz.add.filled}
          </p>
        ) : null}
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

      {stickySubmit ? (
        <BottomActionBar label={submitLabel}>
          <Button type="submit" form={formId} size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {isSubmitting ? uz.add.adding : submitLabel}
          </Button>
        </BottomActionBar>
      ) : (
        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full sm:w-auto sm:self-start">
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
