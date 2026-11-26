"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * One place for short-lived messages ("Saqlandi", "Yangi faol so'z!").
 * Top-centre so it never covers the bottom navigation or the answer buttons.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset="max(0.75rem, env(safe-area-inset-top))"
      duration={4500}
      gap={8}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(24rem,calc(100vw-2rem))] items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm text-foreground shadow-(--shadow-lift)",
          title: "font-semibold",
          description: "text-muted-foreground",
          success: "border-success/30",
          error: "border-destructive/30",
          icon: "shrink-0",
          actionButton:
            "ml-auto shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground",
        },
      }}
    />
  );
}
