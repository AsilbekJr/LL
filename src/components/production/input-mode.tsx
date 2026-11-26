"use client";

import { Keyboard, Mic } from "lucide-react";
import { useInputMode } from "@/hooks/use-input-mode";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

/**
 * Ovoz / Yozish switch for spoken answers. Shown only where speech
 * recognition exists (elsewhere typing is the only way anyway).
 */
export function InputModeToggle({ className }: { className?: string }) {
  const { mode, canVoice, setMode } = useInputMode();
  if (!canVoice) return null;
  const t = uz.production;
  return (
    <div
      role="radiogroup"
      aria-label={t.inputMode}
      className={cn("inline-grid grid-cols-2 gap-1 rounded-xl border bg-sunken p-1", className)}
    >
      {(
        [
          ["voice", Mic, t.inputVoice],
          ["text", Keyboard, t.inputText],
        ] as const
      ).map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={mode === key}
          onClick={() => setMode(key)}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            mode === key
              ? "bg-card text-foreground shadow-(--shadow-soft)"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}
