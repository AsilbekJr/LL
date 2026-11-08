"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Loader2, Plus, Search } from "lucide-react";
import { BottomActionBar } from "@/components/common/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { Badge, Checkbox, Notice } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { useAddItems, useExistingKeys } from "@/hooks/use-items";
import { englishKey, itemInputSchema } from "@/lib/schemas/item";
import type { CefrLevel } from "@/lib/supabase/database.types";
import { loadLevel, subDictionaries, VOCAB_LEVELS, type SubDictionary } from "@/lib/vocab/dictionary";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

/**
 * Built-in CEFR dictionaries: level → many small dictionaries (by word
 * class, alphabetical) → pick the words you do not have yet.
 */
export function DictionaryBrowser() {
  const t = uz.vocab;
  const [level, setLevel] = useState<CefrLevel>("A1");
  const [openId, setOpenId] = useState<string | null>(null);
  const keys = useExistingKeys();
  const words = useQuery({
    queryKey: ["vocab", level],
    queryFn: () => loadLevel(level),
    staleTime: Infinity,
  });
  const subs = useMemo(() => (words.data ? subDictionaries(level, words.data) : []), [level, words.data]);
  const known = keys.data ?? new Set<string>();
  const open = subs.find((s) => s.id === openId) ?? null;

  if (open) {
    return <SubDictionaryView sub={open} known={known} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.intro}</p>

      <div role="tablist" aria-label={uz.items.level} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {VOCAB_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={l === level}
            onClick={() => setLevel(l)}
            className={cn(
              "h-12 rounded-xl border font-display text-lg font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              l === level
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary/40",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      {words.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-sunken" />
          ))}
        </div>
      ) : words.isError ? (
        <Notice tone="danger" icon={AlertTriangle}>
          {t.loadError}{" "}
          <button type="button" className="underline" onClick={() => words.refetch()}>
            {uz.common.retry}
          </button>
        </Notice>
      ) : (
        <>
          <p className="text-sm font-semibold">{t.levelWords(words.data.length)}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {subs.map((s) => {
              const have = s.entries.filter((e) => known.has(englishKey(e.english))).length;
              const done = have === s.entries.length;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(s.id)}
                    className="group flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-(--shadow-soft) transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {t.classes[s.wordClass]}
                        {s.parts > 1 ? (
                          <span className="text-sm font-normal text-muted-foreground">
                            {t.part(s.part, s.parts)}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-muted-foreground" lang="en">
                        {s.from} – {s.to}
                      </span>
                      <span
                        className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sunken"
                        role="progressbar"
                        aria-label={t.progress(have, s.entries.length)}
                        aria-valuemin={0}
                        aria-valuemax={s.entries.length}
                        aria-valuenow={have}
                      >
                        <span
                          className={cn("block h-full rounded-full", done ? "bg-success" : "bg-highlight")}
                          style={{ width: `${(have / s.entries.length) * 100}%` }}
                        />
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {done ? t.allKnown : t.progress(have, s.entries.length)}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t.attribution}</p>
    </div>
  );
}

function SubDictionaryView({
  sub,
  known,
  onBack,
}: {
  sub: SubDictionary;
  known: ReadonlySet<string>;
  onBack: () => void;
}) {
  const t = uz.vocab;
  const add = useAddItems();
  const keys = useExistingKeys();
  const [onlyNew, setOnlyNew] = useState(true);
  const [query, setQuery] = useState("");
  const q = useDeferredValue(query.trim().toLowerCase());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [schedule, setSchedule] = useState(true);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  const isKnown = (english: string) => known.has(englishKey(english));
  const shown = sub.entries.filter(
    (e) =>
      (!onlyNew || !isKnown(e.english)) &&
      (!q || e.english.toLowerCase().includes(q) || e.uzbek.toLowerCase().includes(q)),
  );
  const fresh = shown.filter((e) => !isKnown(e.english));
  const allFreshSelected = fresh.length > 0 && fresh.every((e) => selected.has(e.english));

  function toggle(english: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(english)) next.delete(english);
      else next.add(english);
      return next;
    });
  }

  async function addSelected() {
    setMessage(null);
    const drafts = sub.entries
      .filter((e) => selected.has(e.english) && !isKnown(e.english))
      .map((e) =>
        itemInputSchema.parse({
          english: e.english,
          uzbek: e.uzbek,
          cefr_level: e.level,
          part_of_speech: e.pos.slice(0, 40),
          tags: ["lug'at"],
        }),
      );
    try {
      const r = await add.mutateAsync({ drafts, schedule });
      await keys.refetch();
      setSelected(new Set());
      setMessage({ tone: "success", text: t.added(r.inserted) });
    } catch (e) {
      setMessage({ tone: "danger", text: e instanceof Error ? e.message : uz.common.errorBody });
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", selected.size > 0 && "pb-32")}>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden />
          {t.back}
        </Button>
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold">
          {sub.level} · {t.classes[sub.wordClass]} {sub.parts > 1 ? t.part(sub.part, sub.parts) : ""}
        </h2>
        <p className="text-sm text-muted-foreground" lang="en">
          {sub.from} – {sub.to}
        </p>
      </div>

      {message ? (
        <Notice tone={message.tone} icon={message.tone === "success" ? CheckCircle2 : AlertTriangle}>
          {message.text}{" "}
          {message.tone === "success" ? (
            <Link href="/kutubxona" className="underline underline-offset-2">
              {uz.add.toLibrary}
            </Link>
          ) : null}
        </Notice>
      ) : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
          className="pl-10"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox label={t.onlyNew} checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
        {fresh.length ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSelected((s) => {
                const next = new Set(s);
                for (const e of fresh) {
                  if (allFreshSelected) next.delete(e.english);
                  else next.add(e.english);
                }
                return next;
              })
            }
          >
            {allFreshSelected ? t.clearSelection : t.selectAllNew}
          </Button>
        ) : null}
      </div>

      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-(--shadow-soft)">
        {shown.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">{t.allKnown}</li>
        ) : null}
        {shown.map((e) => {
          const have = isKnown(e.english);
          return (
            <li key={e.english}>
              <label
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  have ? "opacity-60" : "cursor-pointer hover:bg-sunken/60",
                )}
              >
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-primary"
                  disabled={have}
                  checked={have || selected.has(e.english)}
                  onChange={() => toggle(e.english)}
                  aria-label={e.english}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold" lang="en">
                    {e.english}
                  </span>
                  <span className="block text-sm text-muted-foreground" lang="uz">
                    {e.uzbek}
                  </span>
                </span>
                {have ? (
                  <Badge tone="success">{t.inLibrary}</Badge>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">{e.pos}</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {selected.size > 0 ? (
        <BottomActionBar label={t.add(selected.size)}>
          <Checkbox
            className="min-w-0 flex-1 text-sm"
            label={uz.items.scheduleNow}
            checked={schedule}
            onChange={(e) => setSchedule(e.target.checked)}
          />
          <Button className="shrink-0" onClick={addSelected} disabled={add.isPending}>
            {add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
            {t.add(selected.size)}
          </Button>
        </BottomActionBar>
      ) : null}
    </div>
  );
}
