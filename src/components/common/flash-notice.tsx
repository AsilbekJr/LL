"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { takeFlash } from "@/lib/app/flash";

/** Shows (once, as a toast) the message the previous page left with setFlash(). */
export function FlashNotice() {
  useEffect(() => {
    // Read after mount: sessionStorage does not exist during server rendering.
    const f = takeFlash();
    if (!f) return;
    if (f.tone === "success") toast.success(f.text, { duration: 6000 });
    else toast.error(f.text, { duration: 8000 });
  }, []);
  return null;
}
