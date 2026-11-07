"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpenText,
  CalendarClock,
  ChevronRight,
  Loader2,
  Shuffle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { fetchPracticeItems } from "@/lib/production/api";
import { aiTextSchema, type AiText } from "@/lib/reading/ai-text";
import { fetchMyTexts, saveAiText, startBuiltin, type ReadingText } from "@/lib/reading/api";
import { loadBuiltinTexts, type BuiltinText } from "@/lib/reading/texts";
import { todayInTz } from "@/lib/srs/dates";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatDayUz } from "@/lib/i18n/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { LevelPicker, useSpeakingLevel } from "../nutq/speaking-shared";

const sb = () => getSupabaseBrowserClient();
const AI_MAX_WORDS = 6;

export function TextsClient({ aiEnabled }: { aiEnabled: boolean }) {
  const t = uz.texts;
  const today = todayInTz();
  const mine = useQuery({ queryKey: ["reading-texts"], queryFn: () => fetchMyTexts(sb()) });
  const due = (mine.data ?? []).filter((x) => x.due_date && x.due_date <= today);
  const rest = (mine.data ?? []).filter((x) => !due.includes(x));

  return (
    <div className="flex flex-col gap-8">
      <Notice icon={BookOpenText}>{t.method}</Notice>

      {mine.isError ? (
        <Notice tone="danger" icon={AlertTriangle}>
          {uz.common.errorBody}
        </Notice>
      ) : null}

      {due.length ? (
        <Section title={t.due} icon={CalendarClock}>
          <TextList texts={due} today={today} />
        </Section>
      ) : null}

      {aiEnabled ? <AiTextCard /> : null}

      {rest.length ? (
        <Section title={t.mine}>
          <TextList texts={rest} today={today} />
        </Section>
      ) : mine.data && !due.length ? (
        <p className="text-sm text-muted-foreground">{t.noneStarted}</p>
      ) : null}

      <Library started={mine.data ?? []} />

      <p className="text-xs text-muted-foreground">{t.attribution}</p>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        {Icon ? <Icon className="size-5 text-primary" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function TextList({ texts, today }: { texts: ReadingText[]; today: string }) {
  const t = uz.texts;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {texts.map((x) => {
        const isDue = x.due_date !== null && x.due_date <= today;
        return (
          <li key={x.id}>
            <Link
              href={`/matnlar/${x.id}`}
              className="group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-(--shadow-soft) transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{x.level}</Badge>
                  {x.source === "ai" ? <Badge>{t.sourceAi}</Badge> : null}
                  {isDue ? <Badge tone="warning">{t.dueToday}</Badge> : null}
                </span>
                <span className="mt-1.5 block truncate font-semibold" lang="en">
                  {x.title}
                </span>
                <span className="block truncate text-sm text-muted-foreground">{x.title_uz}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t.repetitions(x.repetitions)}
                  {x.last_score !== null ? ` · ${t.lastScore(Math.round(x.last_score * 100))}` : ""}
                  {x.due_date && !isDue ? ` · ${t.nextDue(formatDayUz(x.due_date))}` : ""}
                </span>
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Library({ started }: { started: ReadingText[] }) {
  const t = uz.texts;
  const router = useRouter();
  const [level, setLevel] = useSpeakingLevel([]);
  const texts = useQuery({
    queryKey: ["builtin-texts", level],
    queryFn: () => loadBuiltinTexts(level),
    staleTime: Infinity,
  });
  const byBuiltin = useMemo(() => new Map(started.map((s) => [s.builtin_id, s.id])), [started]);
  const start = useMutation({
    mutationFn: (x: BuiltinText) => startBuiltin(sb(), x, todayInTz()),
    onSuccess: (id) => router.push(`/matnlar/${id}`),
  });

  return (
    <Section title={t.library} icon={BookOpenText}>
      <LevelPicker value={level} onChange={setLevel} />
      {texts.isPending ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />
      ) : texts.isError ? (
        <Notice tone="danger" icon={AlertTriangle}>
          {uz.common.errorBody}
        </Notice>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {texts.data.map((x) => {
            const id = byBuiltin.get(x.id);
            const words = x.sentences.reduce((n, [en]) => n + en.split(/\s+/).length, 0);
            return (
              <li
                key={x.id}
                className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-(--shadow-soft)"
              >
                <div className="min-w-0">
                  <p className="font-semibold" lang="en">
                    {x.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{x.title_uz}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.sentencesCount(x.sentences.length)} · {t.wordsCount(words)}
                  </p>
                </div>
                {id ? (
                  <Button asChild variant="outline" size="sm" className="self-start">
                    <Link href={`/matnlar/${id}`}>{t.open}</Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="self-start"
                    disabled={start.isPending}
                    onClick={() => start.mutate(x)}
                  >
                    {start.isPending && start.variables?.id === x.id ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : null}
                    {t.start}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {start.isError ? (
        <Notice tone="danger" icon={AlertTriangle}>
          {start.error.message}
        </Notice>
      ) : null}
    </Section>
  );
}

async function requestText(body: { level: string; words: string[]; topic?: string }): Promise<AiText> {
  const res = await fetch("/api/ai-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ai-text ${res.status}`);
  return aiTextSchema.parse(((await res.json()) as { text?: unknown }).text);
}

function AiTextCard() {
  const t = uz.texts;
  const router = useRouter();
  const items = useQuery({ queryKey: ["practice-items"], queryFn: () => fetchPracticeItems(sb()) });
  const words = useMemo(
    () => (items.data ?? []).filter((i) => i.type !== "sentence").map((i) => i.english),
    [items.data],
  );
  const [level, setLevel] = useSpeakingLevel(items.data ?? []);
  const [seed, setSeed] = useState(0);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [topic, setTopic] = useState("");
  // Offer up to 12 words (rotating with "other words"); first 5 preselected.
  const offered = useMemo(() => {
    if (!words.length) return [];
    const start = (seed * 12) % words.length;
    return [...words.slice(start), ...words.slice(0, start)].slice(0, 12);
  }, [words, seed]);
  const selected = picked ?? offered.slice(0, 5);

  const generate = useMutation({
    mutationFn: async () => {
      const text = await requestText({ level, words: selected, topic: topic.trim() || undefined });
      return saveAiText(
        sb(),
        {
          level,
          title: text.title,
          title_uz: text.title_uz,
          sentences: text.sentences.map((s) => [s.en, s.uz] as [string, string]),
          key_words: text.key_words.length ? text.key_words : selected,
        },
        todayInTz(),
      );
    },
    onSuccess: (id) => router.push(`/matnlar/${id}`),
  });

  function toggle(w: string) {
    const cur = selected;
    setPicked(cur.includes(w) ? cur.filter((x) => x !== w) : cur.length < AI_MAX_WORDS ? [...cur, w] : cur);
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
        <Sparkles className="size-5 text-primary" aria-hidden />
        {t.aiTitle}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t.aiBody}</p>

      {items.isPending ? (
        <div className="mt-4 h-20 animate-pulse rounded-xl bg-sunken" aria-busy="true" />
      ) : !words.length ? (
        <p className="mt-4 text-sm text-muted-foreground">{t.aiNoWords}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <LevelPicker value={level} onChange={setLevel} />
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {t.aiPick(selected.length, AI_MAX_WORDS)}
              </p>
              {words.length > 12 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSeed((s) => s + 1);
                    setPicked(null);
                  }}
                >
                  <Shuffle aria-hidden />
                  {t.aiShuffle}
                </Button>
              ) : null}
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {offered.map((w) => {
                const on = selected.includes(w);
                return (
                  <li key={w}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(w)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        on
                          ? "border-primary bg-primary-soft text-primary"
                          : "bg-background text-muted-foreground",
                      )}
                      lang="en"
                    >
                      {w}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {t.aiTopic}
            <Input
              value={topic}
              maxLength={80}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t.aiTopicPlaceholder}
            />
          </label>
          <Button onClick={() => generate.mutate()} disabled={!selected.length || generate.isPending}>
            {generate.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {generate.isPending ? t.aiGenerating : t.aiGenerate}
          </Button>
          {generate.isError ? (
            <Notice tone="danger" icon={AlertTriangle}>
              {t.aiError}
            </Notice>
          ) : null}
        </div>
      )}
    </section>
  );
}
