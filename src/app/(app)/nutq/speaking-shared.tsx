"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Textarea } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/button";
import { MicButton, sttMessage, useRecorder } from "@/components/production/production-task";
import { canRecognize } from "@/lib/speech/stt";
import type { CefrLevel } from "@/lib/supabase/database.types";
import { VOCAB_LEVELS } from "@/lib/vocab/dictionary";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const LEVEL_KEY = "ll.speaking.level";

/** The learner's speaking level, remembered on this device. Defaults to their most common item level. */
export function useSpeakingLevel(items: { cefr_level: CefrLevel | null }[]) {
  const [level, setLevel] = useState<CefrLevel>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(LEVEL_KEY) as CefrLevel | null;
      if (saved && VOCAB_LEVELS.includes(saved)) return saved;
    }
    const counts = new Map<CefrLevel, number>();
    for (const i of items) if (i.cefr_level) counts.set(i.cefr_level, (counts.get(i.cefr_level) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "A2";
  });
  useEffect(() => {
    window.localStorage.setItem(LEVEL_KEY, level);
  }, [level]);
  return [level, setLevel] as const;
}

export function LevelPicker({ value, onChange }: { value: CefrLevel; onChange: (l: CefrLevel) => void }) {
  return (
    <div role="radiogroup" aria-label={uz.speaking.level} className="grid grid-cols-6 gap-1.5">
      {VOCAB_LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === value}
          onClick={() => onChange(l)}
          className={cn(
            "h-10 rounded-lg border text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            l === value
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card hover:border-primary/40",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Check({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : Circle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        ok ? "border-success/40 bg-success-soft text-success" : "bg-background text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span lang="en">{label}</span>
    </span>
  );
}

/**
 * Speak (or, without speech recognition, type) one answer.
 * `answer` is the final text once the learner stops; null while not done.
 */
export function useSpokenAnswer() {
  const rec = useRecorder();
  const [supported] = useState(() => canRecognize());
  const [typed, setTyped] = useState<string | null>(null);
  const answer = supported ? (rec.text && !rec.recording ? rec.text : null) : typed;
  return {
    rec,
    supported,
    answer,
    live: rec.text,
    reset() {
      rec.setText("");
      setTyped(null);
    },
    setTyped,
  };
}

export function SpokenAnswerInput({ state }: { state: ReturnType<typeof useSpokenAnswer> }) {
  const [draft, setDraft] = useState("");
  const { rec, supported } = state;
  if (!supported) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{uz.speaking.typeInstead}</p>
        <Textarea rows={2} lang="en" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <Button onClick={() => state.setTyped(draft.trim() || null)} disabled={!draft.trim()}>
          {uz.production.check}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <MicButton recording={rec.recording} onStart={rec.start} onStop={rec.stop} />
      {rec.recording && rec.text ? (
        <p className="w-full rounded-xl border bg-card px-4 py-3 text-lg" lang="en" aria-live="polite">
          {rec.text}
        </p>
      ) : null}
      {sttMessage(rec.error) ? (
        <p className="text-center text-sm text-destructive">{sttMessage(rec.error)}</p>
      ) : null}
    </div>
  );
}
