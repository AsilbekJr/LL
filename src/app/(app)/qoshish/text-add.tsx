"use client";

import { useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Loader2, Plus, ScanText, X } from "lucide-react";
import { BottomActionBar } from "@/components/common/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { Checkbox, Notice, Textarea } from "@/components/ui/form-controls";
import { useAddItems, useExistingKeys } from "@/hooks/use-items";
import { setFlash } from "@/lib/app/flash";
import { queueContextSentences } from "@/lib/items/context-queue";
import { englishKey, itemInputSchema, type ItemDraft } from "@/lib/schemas/item";
import type { CefrLevel } from "@/lib/supabase/database.types";
import {
  buildIndex,
  extractWords,
  markInSentence,
  MAX_TEXT_CHARS,
  wordsForLevel,
  type TextWord,
} from "@/lib/text/extract";
import { loadAll, VOCAB_LEVELS } from "@/lib/vocab/dictionary";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const t = uz.add;

/**
 * "Matndan": paste a story or an article, pick a level, and get the new words
 * at that level — each with the sentence it was met in. Words already in the
 * library are set aside; ✕ drops a word you know. The text itself is not saved.
 */
export function TextAdd({ aiEnabled, afterAdd }: { aiEnabled: boolean; afterAdd: Route }) {
  const router = useRouter();
  const dict = useQuery({ queryKey: ["vocab", "all"], queryFn: loadAll, staleTime: Infinity });
  const index = useMemo(() => (dict.data ? buildIndex(dict.data) : null), [dict.data]);
  const keys = useExistingKeys();
  const add = useAddItems();

  const [text, setText] = useState("");
  const [level, setLevel] = useState<CefrLevel>("B1");
  const [withEasier, setWithEasier] = useState(false);
  const [found, setFound] = useState<TextWord[] | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const library = keys.data ?? new Set<string>();
  const shown = useMemo(
    () => (found ? wordsForLevel(found, level, withEasier) : []),
    [found, level, withEasier],
  );
  const fresh = shown.filter((w) => !library.has(englishKey(w.entry.english)));
  const known = shown.filter((w) => library.has(englishKey(w.entry.english)));
  const chosen = fresh.filter((w) => !removed.has(w.entry.english));

  function analyze() {
    if (!index || !text.trim()) return;
    setFound(extractWords(text, index));
    setRemoved(new Set());
    setError(null);
  }

  async function submit() {
    setError(null);
    const drafts: ItemDraft[] = chosen.map((w) =>
      itemInputSchema.parse({
        english: w.entry.english,
        uzbek: w.entry.uzbek,
        cefr_level: w.entry.level,
        part_of_speech: w.entry.pos,
        // The word is learned in the sentence where it was met.
        example_en: w.sentence,
        tags: ["matn"],
      }),
    );
    try {
      const r = await add.mutateAsync({ drafts, schedule: true });
      if (aiEnabled) queueContextSentences(r.insertedIds);
      setFlash({
        tone: "success",
        text: `${t.textAdded(r.inserted)}${aiEnabled ? ` ${t.contextQueued}` : ""}`,
      });
      router.push(afterAdd);
    } catch (e) {
      setError(e instanceof Error ? e.message : uz.common.errorBody);
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="text-add" className="text-sm font-semibold">
          {t.textLabel}
        </label>
        <Textarea
          id="text-add"
          rows={8}
          lang="en"
          maxLength={MAX_TEXT_CHARS}
          spellCheck={false}
          placeholder={t.textPlaceholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFound(null);
          }}
        />
        <p className="text-xs text-muted-foreground">{t.textHint}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">{t.textLevel}</p>
        <div role="radiogroup" aria-label={t.textLevel} className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {VOCAB_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === level}
              onClick={() => setLevel(l)}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                l === level
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:border-primary/40",
              )}
            >
              {l}
              <span className="text-[10px] font-medium opacity-75">{t.levelNames[l]}</span>
            </button>
          ))}
        </div>
      </div>

      {found === null ? (
        <Button size="lg" onClick={analyze} disabled={!text.trim() || !index}>
          {dict.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <ScanText aria-hidden />}
          {t.analyze}
        </Button>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">{t.textFound(chosen.length)}</h2>
            <Checkbox
              label={t.withEasier}
              checked={withEasier}
              onChange={(e) => setWithEasier(e.target.checked)}
            />
          </div>

          {fresh.length === 0 ? (
            <Notice tone="neutral" icon={AlertTriangle}>
              {t.textNone}
            </Notice>
          ) : (
            <ul className="flex flex-col gap-2" aria-live="polite">
              {fresh.map((w) => {
                const out = removed.has(w.entry.english);
                const marked = markInSentence(w.sentence, w.entry.english);
                return (
                  <li
                    key={w.entry.english}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border bg-card px-4 py-3 shadow-(--shadow-soft) transition-opacity",
                      out && "opacity-45",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className={cn("font-semibold", out && "line-through")} lang="en">
                          {w.entry.english}
                        </span>
                        <span className="text-sm text-muted-foreground" lang="uz">
                          {w.entry.uzbek}
                        </span>
                        <span className="rounded bg-sunken px-1.5 text-[10px] font-semibold text-muted-foreground">
                          {w.entry.level}
                          {w.count > 1 ? ` · ${t.times(w.count)}` : ""}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground" lang="en">
                        {marked ? (
                          <>
                            {marked[0]}
                            <mark className="rounded bg-highlight-soft px-0.5 text-highlight-foreground">
                              {marked[1]}
                            </mark>
                            {marked[2]}
                          </>
                        ) : (
                          w.sentence
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={out ? t.restore(w.entry.english) : t.remove(w.entry.english)}
                      title={out ? t.restoreHint : t.removeHint}
                      onClick={() =>
                        setRemoved((s) => {
                          const n = new Set(s);
                          if (n.has(w.entry.english)) n.delete(w.entry.english);
                          else n.add(w.entry.english);
                          return n;
                        })
                      }
                    >
                      {out ? <Plus aria-hidden /> : <X aria-hidden />}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {known.length ? (
            <details className="rounded-xl border bg-card px-4 py-3">
              <summary className="flex cursor-pointer items-center gap-1 text-sm font-semibold text-muted-foreground">
                <ChevronDown className="size-4" aria-hidden />
                {t.inLibrary(known.length)}
              </summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {known.map((w) => (
                  <li
                    key={w.entry.english}
                    className="rounded-full border px-2.5 py-0.5 text-sm text-muted-foreground"
                    lang="en"
                  >
                    {w.entry.english}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {error ? (
            <Notice tone="danger" icon={AlertTriangle}>
              {error}
            </Notice>
          ) : null}

          <Button variant="ghost" onClick={() => setFound(null)}>
            {t.editText}
          </Button>

          <BottomActionBar label={t.submitText(chosen.length)}>
            <Button
              size="lg"
              className="w-full"
              onClick={() => void submit()}
              disabled={!chosen.length || add.isPending}
            >
              {add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              {add.isPending ? t.adding : t.submitText(chosen.length)}
            </Button>
          </BottomActionBar>
        </>
      )}
    </section>
  );
}
