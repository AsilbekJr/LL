"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Notice } from "@/components/ui/form-controls";
import { Input } from "@/components/ui/input";
import { useExportBackup } from "@/hooks/use-items";
import {
  fetchResetPreview,
  isResetConfirmed,
  RESET_CONFIRM_WORD,
  resetMyData,
  type ResetMode,
} from "@/lib/account/reset";
import { backupFileName } from "@/lib/schemas/backup";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";
import { cn } from "@/lib/utils";

const sb = () => getSupabaseBrowserClient();

function downloadJson(data: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Danger zone": start over like a new user (or reset progress only). */
export function ResetData() {
  const t = uz.reset;
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-destructive/30 bg-card p-5 shadow-(--shadow-soft) sm:p-6">
      <h2 className="font-display text-xl font-semibold text-destructive">{t.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t.body}</p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="mt-4">
            <RotateCcw aria-hidden />
            {t.open}
          </Button>
        </DialogTrigger>
        {open ? <ResetDialog onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </section>
  );
}

function ResetDialog({ onDone }: { onDone: () => void }) {
  const t = uz.reset;
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState<ResetMode>("all");
  const [resetSettings, setResetSettings] = useState(false);
  const [typed, setTyped] = useState("");
  const preview = useQuery({
    queryKey: ["reset-preview"],
    queryFn: () => fetchResetPreview(sb()),
    staleTime: 0,
  });
  const backup = useExportBackup();

  const reset = useMutation({
    mutationFn: () => resetMyData(sb(), mode, resetSettings),
    onSuccess: async () => {
      if (resetSettings) {
        try {
          window.localStorage.removeItem("ll-theme");
        } catch {
          // ignore
        }
      }
      qc.clear();
      onDone();
      router.replace("/bugun");
      router.refresh();
    },
  });

  const confirmed = isResetConfirmed(typed);
  const p = preview.data;

  return (
    <DialogContent title={t.dialogTitle} description={t.dialogBody}>
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2" disabled={reset.isPending}>
          <legend className="mb-2 text-sm font-semibold">{t.modeLabel}</legend>
          {(["all", "progress"] as const).map((m) => (
            <label
              key={m}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                mode === m ? "border-destructive/50 bg-destructive-soft" : "hover:bg-sunken/60",
              )}
            >
              <input
                type="radio"
                name="reset-mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="mt-1 size-4 shrink-0 accent-destructive"
              />
              <span>
                <span className="block font-semibold">{t.modes[m].title}</span>
                <span className="block text-sm text-muted-foreground">{t.modes[m].body}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="rounded-xl bg-sunken px-4 py-3 text-sm" aria-live="polite">
          <p className="font-semibold">{t.willAffect}</p>
          {preview.isPending ? (
            <Loader2 className="mt-2 size-4 animate-spin text-muted-foreground" aria-hidden />
          ) : p ? (
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {mode === "all" ? <li>{t.countItems(p.items)}</li> : <li>{t.countKept(p.items)}</li>}
              <li>{t.countStudied(p.studied)}</li>
              <li>{t.countReviews(p.reviews)}</li>
              <li>{t.countProductions(p.productions)}</li>
              <li>{mode === "all" ? t.countTextsDeleted(p.texts) : t.countTextsReset(p.texts)}</li>
              <li>{t.calendar}</li>
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">{uz.common.errorBody}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t.kept}</p>
        </div>

        <Checkbox
          label={t.resetSettings}
          description={t.resetSettingsHint}
          checked={resetSettings}
          disabled={reset.isPending}
          onChange={(e) => setResetSettings(e.target.checked)}
        />

        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t.backupHint}</p>
          <Button
            variant="outline"
            className="self-start"
            disabled={backup.isPending || reset.isPending}
            onClick={async () => {
              const file = await backup.mutateAsync();
              downloadJson(file, backupFileName(new Date()));
            }}
          >
            {backup.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
            {backup.isSuccess ? t.backupDone : t.backup}
          </Button>
          {backup.isError ? <p className="text-sm text-destructive">{backup.error.message}</p> : null}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {t.confirmLabel(RESET_CONFIRM_WORD)}
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={RESET_CONFIRM_WORD}
            disabled={reset.isPending}
            aria-invalid={typed && !confirmed ? true : undefined}
          />
        </label>

        {reset.isError ? (
          <Notice tone="danger" icon={AlertTriangle}>
            {t.failed} ({reset.error.message})
          </Notice>
        ) : null}

        <Button
          variant="destructive"
          size="lg"
          disabled={!confirmed || reset.isPending}
          onClick={() => reset.mutate()}
        >
          {reset.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
          {reset.isPending ? t.running : mode === "all" ? t.confirmAll : t.confirmProgress}
        </Button>
      </div>
    </DialogContent>
  );
}
