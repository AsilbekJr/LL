import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full min-w-0 rounded-lg border border-input bg-card text-base shadow-(--shadow-soft) transition-[border-color,box-shadow] outline-none hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/15 disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldBase,
        "min-h-24 px-3.5 py-3 leading-relaxed placeholder:text-muted-foreground/80",
        className,
      )}
      {...props}
    />
  );
}

/** Native select (best on mobile: uses the OS picker), styled like Input. */
export function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select data-slot="select" className={cn(fieldBase, "h-12 appearance-none pr-10 pl-3.5")} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

export function Checkbox({
  className,
  label,
  description,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: React.ReactNode; description?: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 select-none", className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-md border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        {...props}
      />
      <span className="text-sm leading-snug">
        <span className="font-semibold">{label}</span>
        {description ? <span className="block text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>;
  className?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-semibold">
        {label}
        {optional ? <span className="text-xs font-medium text-muted-foreground">ixtiyoriy</span> : null}
      </label>
      {React.cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-sunken text-muted-foreground",
  primary: "bg-primary-soft text-primary-soft-foreground",
  highlight: "bg-highlight-soft text-highlight-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-destructive-soft text-destructive",
} as const;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Inline status / result message. */
export function Notice({
  tone = "neutral",
  icon: Icon,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  tone?: "neutral" | "success" | "danger" | "warning";
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  const tones = {
    neutral: "border-border bg-sunken text-foreground",
    success: "border-success/25 bg-success-soft text-success",
    danger: "border-destructive/25 bg-destructive-soft text-destructive",
    warning: "border-warning/30 bg-warning-soft text-warning",
  } as const;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
