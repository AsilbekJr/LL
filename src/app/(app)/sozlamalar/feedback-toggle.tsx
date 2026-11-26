"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";
import { Checkbox } from "@/components/ui/form-controls";
import { feedback, feedbackEnabled, setFeedbackEnabled } from "@/lib/feedback/feedback";
import { uz } from "@/lib/i18n/uz";

/** Sound and vibration on answers — a device setting (kept in this browser). */
export function FeedbackToggle() {
  const [on, setOn] = useState(() => (typeof window === "undefined" ? true : feedbackEnabled()));
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
          setOn(e.target.checked);
          setFeedbackEnabled(e.target.checked);
          if (e.target.checked) feedback("success");
        }}
      />
    </section>
  );
}
