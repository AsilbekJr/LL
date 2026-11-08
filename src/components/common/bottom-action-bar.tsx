"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const noop = () => () => {};

/**
 * Action bar pinned to the bottom of the screen, above the mobile bottom
 * navigation (beside the sidebar on desktop), so the main button never needs
 * scrolling to. Rendered in a portal: the app's animated (transformed) <main>
 * would otherwise pin a "fixed" bar to the end of the page instead.
 * Pages that use it should leave ~6rem of bottom padding so the bar never
 * covers their last field.
 */
export function BottomActionBar({
  children,
  label,
  role = "region",
  className,
}: {
  children: ReactNode;
  label: string;
  role?: "region" | "toolbar";
  className?: string;
}) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(
    <div
      role={role}
      aria-label={label}
      className={cn(
        "animate-rise fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border bg-card p-3 shadow-(--shadow-lift) md:bottom-6 md:left-[calc(16rem+1.5rem)]",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
