"use client";

import { useStored } from "@/hooks/use-stored";
import { Volume2 } from "lucide-react";
import { Checkbox } from "@/components/ui/form-controls";
import { feedback, FEEDBACK_KEY } from "@/lib/feedback/feedback";
import { uz } from "@/lib/i18n/uz";

/** Sound and vibration on answers — a device setting (kept in this browser). */
export function FeedbackToggle() {
  const [saved, setSaved] = useStored(FEEDBACK_KEY);
  const on = saved !== "off";
  return (
    <section className="flex items-start gap-4 rounded-2xl border bg-card p-4 shadow-(--shadow-soft)">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
        <Volume2 className="size-5" aria-hidden />
      </span>
      <Checkbox
        className="flex-1"
        label={uz.settings.feedbackTitle}
        description={uz.settings.feedbackBody}
        checked={on}
        onChange={(e) => {
          setSaved(e.target.checked ? "on" : "off");
          if (e.target.checked) feedback("success");
        }}
      />
    </section>
  );
}
