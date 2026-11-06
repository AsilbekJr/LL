import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // text-base (16px) prevents iOS Safari from zooming on focus
        "flex h-12 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 text-base shadow-(--shadow-soft) transition-[border-color,box-shadow] outline-none",
        "placeholder:text-muted-foreground/80",
        "hover:border-muted-foreground/40",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25",
        "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/15",
        "disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
