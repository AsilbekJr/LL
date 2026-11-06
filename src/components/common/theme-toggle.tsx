"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { uz } from "@/lib/i18n/uz";

type Theme = "system" | "light" | "dark";
const KEY = "ll-theme";
const EVENT = "ll-theme-change";

function readTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function apply(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const OPTIONS = [
  { value: "light", label: uz.theme.light, icon: Sun },
  { value: "system", label: uz.theme.system, icon: Monitor },
  { value: "dark", label: uz.theme.dark, icon: Moon },
] as const;

/** Segmented light / system / dark switch. Persists to localStorage (read by the head script). */
export function ThemeToggle({ className }: { className?: string }) {
  // null on the server: no option is shown as selected until hydration.
  const theme = useSyncExternalStore<Theme | null>(subscribe, readTheme, () => null);

  // Follow OS changes while on "system"; also re-apply after another tab changes the theme.
  useEffect(() => {
    if (!theme) return;
    apply(theme);
    if (theme !== "system") return;
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [theme]);

  function choose(next: Theme) {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div
      role="radiogroup"
      aria-label={uz.theme.label}
      className={cn("grid grid-cols-3 gap-1 rounded-lg bg-sunken p-1", className)}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={cn(
              "flex h-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "bg-card text-foreground shadow-(--shadow-soft)" : "hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
