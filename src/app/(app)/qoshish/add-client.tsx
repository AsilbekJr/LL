"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ListPlus, Loader2, PenLine, Plus } from "lucide-react";
import { BottomActionBar } from "@/components/common/bottom-action-bar";
import { ItemForm } from "@/components/items/item-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Checkbox, Field, Notice, Select, Textarea } from "@/components/ui/form-controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAddItems, useExistingKeys } from "@/hooks/use-items";
import { setFlash } from "@/lib/app/flash";
import { dedupeItems } from "@/lib/items/dedupe";
import { enrichDrafts } from "@/lib/items/enrich";
import { parsePasteList } from "@/lib/items/paste";
import { CEFR_LEVELS, parseTags, type ItemDraft } from "@/lib/schemas/item";
import { uz } from "@/lib/i18n/uz";

type Result = { tone: "success" | "danger" | "warning"; text: string } | null;

/** Where the learner lands after adding: today's plan, with a short confirmation. */
const AFTER_ADD = "/bugun";

export function AddClient({ aiEnabled }: { aiEnabled: boolean }) {
  const t = uz.add;
  return (
    // Bottom padding: the pinned add button must never cover the last field.
    <Tabs defaultValue="single" className="pb-24">
      <TabsList className="w-full sm:w-auto">
        <TabsTrigger value="single">
          <PenLine aria-hidden />
          {t.single}
        </TabsTrigger>
        <TabsTrigger value="list">
          <ListPlus aria-hidden />
          {t.list}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="single">
        <SingleAdd aiEnabled={aiEnabled} />
      </TabsContent>
      <TabsContent value="list">
        <ListAdd aiEnabled={aiEnabled} />
      </TabsContent>
    </Tabs>
  );
}

function SingleAdd({ aiEnabled }: { aiEnabled: boolean }) {
  const add = useAddItems();
  const router = useRouter();
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(draft: ItemDraft, schedule: boolean) {
    setResult(null);
    const r = await add.mutateAsync({ drafts: [draft], schedule });
    if (!r.inserted) {
      // Already in the library: stay here so the learner can fix the word.
      setResult({ tone: "warning", text: uz.add.duplicate(draft.english) });
      return;
    }
    setFlash({ tone: "success", text: uz.add.added(draft.english, r.scheduledCards > 0) });
    router.push(AFTER_ADD);
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-soft) sm:p-6">
      {result ? (
        <Notice
          tone={result.tone}
          icon={result.tone === "success" ? CheckCircle2 : AlertTriangle}
          className="mb-5"
          aria-live="polite"
        >
          {result.text}
        </Notice>
      ) : null}
      <ItemForm
        submitLabel={uz.add.submit}
        withSchedule
        stickySubmit
        autoDetails={{ ai: aiEnabled }}
        onSubmit={onSubmit}
      />
    </section>
  );
}

function ListAdd({ aiEnabled }: { aiEnabled: boolean }) {
  const t = uz.add;
  const router = useRouter();
  const [enriching, setEnriching] = useState(false);
  const [text, setText] = useState("");
  const [level, setLevel] = useState<"" | (typeof CEFR_LEVELS)[number]>("");
  const [tags, setTags] = useState("");
  const [schedule, setSchedule] = useState(true);
  const [result, setResult] = useState<Result>(null);
  const keys = useExistingKeys();
  const add = useAddItems();

  const parsed = useMemo(
    () => parsePasteList(text, { cefr_level: level || null, tags: parseTags(tags) }),
    [text, level, tags],
  );
  const split = useMemo(() => dedupeItems(parsed.items, keys.data ?? new Set()), [parsed.items, keys.data]);
  const hasInput = text.trim().length > 0;

  async function submit() {
    setResult(null);
    try {
      // Example (EN + UZ), part of speech and note for every new word; best
      // effort, so a slow or missing AI never blocks adding the list.
      setEnriching(true);
      const drafts = await enrichDrafts(split.fresh, { ai: aiEnabled }).catch(() => split.fresh);
      setEnriching(false);
      const r = await add.mutateAsync({ drafts, schedule });
      if (!r.inserted) {
        setResult({ tone: "warning", text: t.nothingToAdd });
        await keys.refetch();
        return;
      }
      setFlash({ tone: "success", text: t.listAdded(r.inserted, r.duplicates) });
      router.push(AFTER_ADD);
    } catch (e) {
      setEnriching(false);
      setResult({ tone: "danger", text: e instanceof Error ? e.message : uz.common.errorBody });
    }
  }

  const busy = enriching || add.isPending;

  return (
    <div className="flex flex-col gap-5">
      {result ? (
        <Notice
          tone={result.tone}
          icon={result.tone === "success" ? CheckCircle2 : AlertTriangle}
          aria-live="polite"
        >
          {result.text}
        </Notice>
      ) : null}

      <section className="flex flex-col gap-5 rounded-2xl border bg-card p-5 shadow-(--shadow-soft) sm:p-6">
        <Field id="paste" label={t.listLabel} hint={t.listHint}>
          <Textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.listPlaceholder}
            spellCheck={false}
            className="font-mono text-[0.95rem]"
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="paste-level" label={t.defaultLevel} optional>
            <Select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}>
              <option value="">—</option>
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="paste-tags" label={t.defaultTags} optional>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              placeholder="travel, work"
            />
          </Field>
        </div>
        <Checkbox
          label={uz.items.scheduleNow}
          description={uz.items.scheduleNowHint}
          checked={schedule}
          onChange={(e) => setSchedule(e.target.checked)}
        />
      </section>

      {hasInput ? (
        <section
          aria-labelledby="preview-title"
          className="rounded-2xl border bg-card shadow-(--shadow-soft)"
        >
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-4">
            <h2 id="preview-title" className="mr-auto font-display text-lg font-semibold">
              {t.preview}
            </h2>
            <Badge tone="success">{t.willAdd(split.fresh.length)}</Badge>
            {split.existing.length ? <Badge>{t.already(split.existing.length)}</Badge> : null}
            {split.repeated.length ? <Badge tone="warning">{t.repeated(split.repeated.length)}</Badge> : null}
            {parsed.errors.length ? <Badge tone="danger">{t.invalid(parsed.errors.length)}</Badge> : null}
          </div>

          <ul className="max-h-80 divide-y overflow-y-auto">
            {parsed.errors.map((e) => (
              <li key={`e${e.line}`} className="flex items-start gap-3 px-5 py-3 text-sm">
                <Badge tone="danger">{t.lineError(e.line)}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono">{e.text}</span>
                  <span className="text-destructive">{e.reason}</span>
                </span>
              </li>
            ))}
            {parsed.items.map((i) => {
              const state = split.fresh.includes(i)
                ? "fresh"
                : split.existing.includes(i)
                  ? "existing"
                  : "repeated";
              return (
                <li
                  key={i.line}
                  className={
                    state === "fresh"
                      ? "flex items-center gap-3 px-5 py-3"
                      : "flex items-center gap-3 px-5 py-3 opacity-55"
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" lang="en">
                      {i.english}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">{i.uzbek}</span>
                  </span>
                  <Badge tone={state === "fresh" ? "primary" : state === "existing" ? "neutral" : "warning"}>
                    {state === "fresh"
                      ? uz.items.types[i.type]
                      : state === "existing"
                        ? t.already(1)
                        : t.repeated(1)}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {hasInput ? (
        <BottomActionBar label={t.submitList(split.fresh.length)}>
          <Button
            size="lg"
            className="w-full"
            disabled={!split.fresh.length || busy || keys.isLoading}
            onClick={submit}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
            {enriching
              ? t.enriching(split.fresh.length)
              : add.isPending
                ? t.adding
                : t.submitList(split.fresh.length)}
          </Button>
        </BottomActionBar>
      ) : null}
    </div>
  );
}
