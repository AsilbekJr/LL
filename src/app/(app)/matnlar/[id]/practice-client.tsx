"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Square,
  Trash2,
} from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SpeakButton, type SpeechPrefs } from "@/components/review/shared";
import { Button } from "@/components/ui/button";
import { Badge, Notice } from "@/components/ui/form-controls";
import { useAddItems, useExistingKeys } from "@/hooks/use-items";
import { completePractice, deleteText, fetchText, type ReadingText } from "@/lib/reading/api";
import { lookupCandidates, parseSentences, splitWords, type TextSentence } from "@/lib/reading/texts";
import { retellScore } from "@/lib/reading/score";
import { englishKey, itemInputSchema } from "@/lib/schemas/item";
import { speak, stopSpeaking } from "@/lib/speech/tts";
import { todayInTz } from "@/lib/srs/dates";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { usesTerm, wordSimilarity } from "@/lib/text/usage";
import { loadAll, type VocabEntry } from "@/lib/vocab/dictionary";
import { formatDayUz } from "@/lib/i18n/format";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";
import { Check, SpokenAnswerInput, useSpokenAnswer } from "../../nutq/speaking-shared";

const sb = () => getSupabaseBrowserClient();
type Scores = [number | null, number | null, number | null, number | null];

export function PracticeClient({ id, speech }: { id: string; speech: SpeechPrefs }) {
  const t = uz.texts;
  const text = useQuery({ queryKey: ["reading-text", id], queryFn: () => fetchText(sb(), id) });

  if (text.isPending) return <div className="h-96 animate-pulse rounded-2xl bg-sunken" aria-busy="true" />;
  if (text.isError || !text.data) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={text.isError ? uz.common.errorTitle : t.notFound}
        action={
          <Button asChild>
            <Link href="/matnlar">{t.back}</Link>
          </Button>
        }
      />
    );
  }
  return <Practice text={text.data} speech={speech} />;
}

function Practice({ text, speech }: { text: ReadingText; speech: SpeechPrefs }) {
  const t = uz.texts;
  const sentences = useMemo(() => parseSentences(text.sentences), [text.sentences]);
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Scores>([null, null, null, null]);
  const [result, setResult] = useState<{ score: number; dueDate: string } | null>(null);
  const qc = useQueryClient();
  const router = useRouter();

  const finish = useMutation({
    mutationFn: async (final: Scores) => {
      const done = final.filter((s): s is number => s !== null);
      const score = done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0;
      const next = await completePractice(sb(), text, score, todayInTz());
      return { score, dueDate: next.dueDate };
    },
    onSuccess: async (r) => {
      setResult(r);
      await qc.invalidateQueries({ queryKey: ["reading-texts"] });
      await qc.invalidateQueries({ queryKey: ["reading-text", text.id] });
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteText(sb(), text.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["reading-texts"] });
      router.push("/matnlar");
    },
  });

  function done(score: number | null) {
    const next = [...scores] as Scores;
    next[step] = score;
    setScores(next);
    stopSpeaking();
    if (step < 3) setStep(step + 1);
    else finish.mutate(next);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/matnlar">
            <ArrowLeft aria-hidden />
            {t.back}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.confirm(t.removeConfirm) && remove.mutate()}
          disabled={remove.isPending}
          aria-label={t.remove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      <header>
        <div className="flex items-center gap-2">
          <Badge tone="primary">{text.level}</Badge>
          {text.source === "ai" ? <Badge>{t.sourceAi}</Badge> : null}
          <span className="text-xs text-muted-foreground">{t.repetitions(text.repetitions)}</span>
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold" lang="en">
          {text.title}
        </h1>
        <p className="text-muted-foreground">{text.title_uz}</p>
      </header>

      <ol className="grid grid-cols-4 gap-1.5" aria-label="Bosqichlar">
        {t.steps.map((name, i) => (
          <li
            key={name}
            aria-current={i === step && !result ? "step" : undefined}
            className={cn(
              "rounded-lg border px-2 py-2 text-center text-xs font-semibold",
              result || i < step
                ? "border-success/40 bg-success-soft text-success"
                : i === step
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground",
            )}
          >
            <span className="block tabular-nums">{i + 1}</span>
            <span className="block truncate">{name}</span>
          </li>
        ))}
      </ol>

      {result ? (
        <Result result={result} scores={scores} />
      ) : finish.isPending ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.stepHint[step]}</p>
          {step === 0 ? (
            <ListenStep sentences={sentences} speech={speech} level={text.level} onDone={() => done(null)} />
          ) : null}
          {step === 1 ? (
            <SentenceStep key="shadow" mode="shadow" sentences={sentences} speech={speech} onDone={done} />
          ) : null}
          {step === 2 ? (
            <SentenceStep key="recall" mode="recall" sentences={sentences} speech={speech} onDone={done} />
          ) : null}
          {step === 3 ? <RetellStep keyWords={text.key_words} onDone={done} /> : null}
          {finish.isError ? (
            <Notice tone="danger" icon={AlertTriangle}>
              {finish.error.message}
            </Notice>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------- 1. listen & read -------------------------------------------------

function ListenStep({
  sentences,
  speech,
  level,
  onDone,
}: {
  sentences: TextSentence[];
  speech: SpeechPrefs;
  level: string;
  onDone: () => void;
}) {
  const t = uz.texts;
  const [playing, setPlaying] = useState<number | null>(null);
  const [showUz, setShowUz] = useState(false);
  const [word, setWord] = useState<{ word: string; sentence: TextSentence } | null>(null);
  const stopRef = useRef(false);

  useEffect(() => () => stopSpeaking(), []);

  async function playFrom(start: number) {
    stopRef.current = false;
    for (let i = start; i < sentences.length; i++) {
      if (stopRef.current) break;
      setPlaying(i);
      const r = await speak(sentences[i]![0], speech);
      if (!r.ok) break;
    }
    setPlaying(null);
  }

  function stop() {
    stopRef.current = true;
    stopSpeaking();
    setPlaying(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {playing === null ? (
          <Button onClick={() => void playFrom(0)}>
            <Play aria-hidden />
            {t.playAll}
          </Button>
        ) : (
          <Button variant="destructive" onClick={stop}>
            <Square className="fill-current" aria-hidden />
            {t.stop}
          </Button>
        )}
        <Button variant="outline" onClick={() => setShowUz((s) => !s)}>
          {showUz ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {showUz ? t.hideTranslation : t.showTranslation}
        </Button>
      </div>

      <article className="bg-ruled rounded-2xl border bg-card p-5 text-lg leading-relaxed shadow-(--shadow-lift)">
        {sentences.map((s, i) => (
          <p
            key={i}
            className={cn(
              "mb-3 rounded-lg px-1 transition-colors last:mb-0",
              playing === i && "bg-highlight-soft",
            )}
          >
            <button
              type="button"
              onClick={() => {
                stop();
                void speak(s[0], speech);
              }}
              className="mr-1 inline-grid size-6 place-items-center rounded-full align-middle text-muted-foreground hover:bg-sunken"
              aria-label={`${uz.review.listen}: ${s[0]}`}
            >
              <Play className="size-3.5" aria-hidden />
            </button>
            <span lang="en">
              {splitWords(s[0]).map((piece, k) =>
                piece.word ? (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setWord({ word: piece.text, sentence: s })}
                    className={cn(
                      "rounded-sm underline-offset-4 hover:bg-primary-soft hover:underline",
                      word?.word === piece.text && word.sentence === s && "bg-primary-soft",
                    )}
                  >
                    {piece.text}
                  </button>
                ) : (
                  <span key={k}>{piece.text}</span>
                ),
              )}
            </span>
            {showUz ? (
              <span className="mt-0.5 block text-base text-muted-foreground" lang="uz">
                {s[1]}
              </span>
            ) : null}
          </p>
        ))}
      </article>

      {word ? (
        <WordLookup word={word.word} sentence={word.sentence} level={level} onClose={() => setWord(null)} />
      ) : null}

      <Button size="lg" onClick={onDone}>
        {t.next}
      </Button>
    </div>
  );
}

function WordLookup({
  word,
  sentence,
  level,
  onClose,
}: {
  word: string;
  sentence: TextSentence;
  level: string;
  onClose: () => void;
}) {
  const t = uz.texts;
  const dict = useQuery({ queryKey: ["vocab", "all"], queryFn: loadAll, staleTime: Infinity });
  const keys = useExistingKeys();
  const add = useAddItems();
  const entry: VocabEntry | null = useMemo(() => {
    if (!dict.data) return null;
    const map = new Map(dict.data.map((e) => [e.english.toLowerCase(), e]));
    for (const c of lookupCandidates(word)) {
      const e = map.get(c);
      if (e) return e;
    }
    return null;
  }, [dict.data, word]);
  const have = entry ? keys.data?.has(englishKey(entry.english)) : false;

  return (
    <div
      role="dialog"
      aria-label={word}
      className="animate-rise rounded-2xl border bg-popover p-4 shadow-(--shadow-lift)"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {dict.isPending ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
          ) : entry ? (
            <>
              <p className="text-lg font-semibold" lang="en">
                {entry.english} <Badge tone="primary">{entry.level}</Badge>{" "}
                <span className="text-xs font-normal text-muted-foreground">{entry.pos}</span>
              </p>
              <p className="text-muted-foreground" lang="uz">
                {entry.uzbek}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground" lang="en">
                {word}
              </span>{" "}
              — {t.lookupNone}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <SpeakButtonMini text={entry?.english ?? word} />
          <Button variant="ghost" size="sm" onClick={onClose} aria-label={uz.common.close}>
            ✕
          </Button>
        </div>
      </div>
      {entry ? (
        <div className="mt-3">
          {have || add.isSuccess ? (
            <Badge tone="success">{add.isSuccess ? t.lookupAdded : t.lookupHave}</Badge>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={add.isPending}
              onClick={() =>
                add.mutate({
                  drafts: [
                    itemInputSchema.parse({
                      english: entry.english,
                      uzbek: entry.uzbek,
                      cefr_level: entry.level,
                      part_of_speech: entry.pos.slice(0, 40),
                      example_en: sentence[0],
                      example_uz: sentence[1] || undefined,
                      tags: ["matn", level.toLowerCase()],
                    }),
                  ],
                  schedule: true,
                })
              }
            >
              {add.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              {t.lookupAdd}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SpeakButtonMini({ text }: { text: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={() => void speak(text)} aria-label={uz.review.listen}>
      <Play aria-hidden />
    </Button>
  );
}

// ---------- 2. shadowing / 3. recall -----------------------------------------

function SentenceStep({
  mode,
  sentences,
  speech,
  onDone,
}: {
  mode: "shadow" | "recall";
  sentences: TextSentence[];
  speech: SpeechPrefs;
  onDone: (score: number | null) => void;
}) {
  const t = uz.texts;
  const [i, setI] = useState(0);
  const [results, setResults] = useState<number[]>([]);
  const answer = useSpokenAnswer();
  const [en, uzText] = sentences[i]!;
  const similarity = answer.answer ? wordSimilarity(answer.answer, en) : null;
  const last = i === sentences.length - 1;

  function next() {
    const all = similarity !== null ? [...results, similarity] : results;
    setResults(all);
    answer.reset();
    if (last) onDone(all.length ? all.reduce((a, b) => a + b, 0) / all.length : null);
    else setI(i + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border bg-card px-5 py-6 text-center shadow-(--shadow-lift)">
        <p className="text-xs font-semibold text-muted-foreground tabular-nums">
          {t.sentenceOf(i + 1, sentences.length)}
        </p>
        {mode === "shadow" ? (
          <>
            <p className="mt-2 font-display text-2xl leading-snug font-semibold" lang="en">
              {en}
            </p>
            {uzText ? <p className="mt-2 text-sm text-muted-foreground">{uzText}</p> : null}
            <div className="mt-4">
              <SpeakButton key={en} text={en} prefs={speech} autoPlay />
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 font-display text-2xl leading-snug font-semibold" lang="uz">
              {uzText || en}
            </p>
            {similarity !== null ? (
              <div className="mt-4 border-t pt-3">
                <p className="text-lg font-semibold" lang="en">
                  {en}
                </p>
                <div className="mt-2">
                  <SpeakButton text={en} prefs={speech} />
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {!answer.answer ? <SpokenAnswerInput state={answer} /> : null}

      {similarity !== null ? (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3",
            similarity >= 0.75
              ? "border-success/30 bg-success-soft text-success"
              : "border-warning/30 bg-warning-soft text-warning",
          )}
        >
          <p className="font-semibold">{uz.production.similarity(Math.round(similarity * 100))}</p>
          <p className="mt-1 text-sm text-foreground" lang="en">
            <span className="text-muted-foreground">{uz.production.transcript}</span> {answer.answer}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {similarity !== null ? (
          <Button variant="outline" onClick={() => answer.reset()}>
            <RotateCcw aria-hidden />
            {uz.production.redo}
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() =>
              onDone(results.length ? results.reduce((a, b) => a + b, 0) / results.length : null)
            }
          >
            <SkipForward aria-hidden />
            {t.skip}
          </Button>
        )}
        <Button onClick={next} autoFocus={similarity !== null}>
          {last ? t.next : t.nextSentence}
        </Button>
      </div>
    </div>
  );
}

// ---------- 4. retell --------------------------------------------------------

function RetellStep({ keyWords, onDone }: { keyWords: string[]; onDone: (score: number | null) => void }) {
  const t = uz.texts;
  const answer = useSpokenAnswer();
  const said = answer.answer ?? answer.live;
  const r = retellScore(said, keyWords);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border bg-card p-5 shadow-(--shadow-lift)">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {t.keyWords}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-live="polite">
          {keyWords.map((w) => (
            <Check key={w} ok={usesTerm(said, w)} label={w} />
          ))}
        </div>
      </section>

      {!answer.answer ? <SpokenAnswerInput state={answer} /> : null}

      {answer.answer ? (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3",
            r.score >= 0.6
              ? "border-success/30 bg-success-soft text-success"
              : "border-warning/30 bg-warning-soft text-warning",
          )}
        >
          <p className="font-semibold">{t.retellCheck(r.used, keyWords.length)}</p>
          {r.tooShort ? <p className="text-sm">{t.retellShort}</p> : null}
          <p className="mt-1 text-sm text-foreground" lang="en">
            {answer.answer}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        {answer.answer ? (
          <Button variant="outline" onClick={() => answer.reset()}>
            <RotateCcw aria-hidden />
            {uz.production.redo}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => onDone(null)}>
            <SkipForward aria-hidden />
            {t.skip}
          </Button>
        )}
        <Button onClick={() => onDone(r.score)} disabled={!answer.answer}>
          <CheckCircle2 aria-hidden />
          {t.finish}
        </Button>
      </div>
    </div>
  );
}

function Result({ result, scores }: { result: { score: number; dueDate: string }; scores: Scores }) {
  const t = uz.texts;
  const pct = Math.round(result.score * 100);
  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6 text-center shadow-(--shadow-lift)">
      <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
      <h2 className="font-display text-2xl font-semibold">{t.resultTitle}</h2>
      <p className="font-display text-4xl font-semibold tabular-nums">{t.resultScore(pct)}</p>
      <ul className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
        {t.steps.slice(1).map((name, i) => {
          const s = scores[i + 1] ?? null;
          return <li key={name}>{t.stepScore(name, s === null ? null : Math.round(s * 100))}</li>;
        })}
      </ul>
      <p className="text-sm">
        {result.score >= 0.6 ? t.resultNext(formatDayUz(result.dueDate)) : t.resultRetry}
      </p>
      <Button asChild>
        <Link href="/matnlar">{t.back}</Link>
      </Button>
    </section>
  );
}
