"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Notice } from "@/components/ui/form-controls";
import { takeFlash, type Flash } from "@/lib/app/flash";
import { uz } from "@/lib/i18n/uz";

/** Shows (once) the message the previous page left with setFlash(). */
export function FlashNotice() {
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    // Read after mount: sessionStorage does not exist during server rendering.
    const f = takeFlash();
    if (!f) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only storage
    setFlash(f);
    const timer = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!flash) return null;
  return (
    <Notice
      tone={flash.tone}
      icon={flash.tone === "success" ? CheckCircle2 : AlertTriangle}
      className="mb-5 items-center"
      aria-live="polite"
    >
      <span className="flex-1">{flash.text}</span>
      <button
        type="button"
        onClick={() => setFlash(null)}
        aria-label={uz.common.close}
        className="-m-1 rounded-md p-1 opacity-70 hover:opacity-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </Notice>
  );
}
