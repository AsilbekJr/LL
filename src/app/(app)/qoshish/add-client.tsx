"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ListPlus, Loader2, PenLine } from "lucide-react";
import { ItemForm } from "@/components/items/item-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Checkbox, Field, Notice, Select, Textarea } from "@/components/ui/form-controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAddItems, useExistingKeys } from "@/hooks/use-items";
import { dedupeItems } from "@/lib/items/dedupe";
import { parsePasteList } from "@/lib/items/paste";
import { CEFR_LEVELS, parseTags, type ItemDraft } from "@/lib/schemas/item";
import { uz } from "@/lib/i18n/uz";

type Result = { tone: "success" | "danger" | "warning"; text: string } | null;

export function AddClient() {
  const t = uz.add;
  return (
    <Tabs defaultValue="single">
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
        <SingleAdd />
      </TabsContent>
      <TabsContent value="list">
        <ListAdd />
      </TabsContent>
    </Tabs>
  );
}

function SingleAdd() {
  const add = useAddItems();
  const [result, setResult] = useState<Result>(null);

  async function onSubmit(draft: ItemDraft, schedule: boolean) {
    setResult(null);
    const r = await add.mutateAsync({ drafts: [draft], schedule });
    setResult(
      r.inserted
        ? { tone: "success", text: uz.add.added(draft.english, r.scheduledCards > 0) }
        : { tone: "warning", text: uz.add.duplicate(draft.english) },
    );
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
      <ItemForm submitLabel={uz.add.submit} withSchedule resetOnSuccess onSubmit={onSubmit} />
    </section>
  );
}

function ListAdd() {
  const t = uz.add;
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
      const r = await add.mutateAsync({ drafts: split.fresh, schedule });
      setResult(
        r.inserted
          ? { tone: "success", text: t.listDone(r.inserted, r.duplicates) }
          : { tone: "warning", text: t.nothingToAdd },
      );
      if (r.inserted) setText("");
      await keys.refetch();
    } catch (e) {
      setResult({ tone: "danger", text: e instanceof Error ? e.message : uz.common.errorBody });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {result ? (
        <Notice
          tone={result.tone}
          icon={result.tone === "success" ? CheckCircle2 : AlertTriangle}
          aria-live="polite"
        >
          {result.text}{" "}
          {result.tone === "success" ? (
            <Link href="/kutubxona" className="underline underline-offset-2">
              {t.toLibrary}
            </Link>
          ) : null}
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

          <div className="border-t p-4">
            <Button
              size="lg"
              className="w-full"
              disabled={!split.fresh.length || add.isPending || keys.isLoading}
              onClick={submit}
            >
              {add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {t.submitList(split.fresh.length)}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
