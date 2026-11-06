import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "bg-ruled relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border bg-card px-6 py-12 text-center shadow-(--shadow-soft)",
        className,
      )}
    >
      <div className="relative mb-1 grid size-16 place-items-center rounded-2xl bg-primary-soft text-primary-soft-foreground">
        <Icon className="size-7" aria-hidden strokeWidth={1.75} />
        <span
          className="absolute -right-1 -bottom-1 size-4 rounded-full border-2 border-card bg-highlight"
          aria-hidden
        />
      </div>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {description ? (
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
