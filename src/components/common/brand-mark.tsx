import { cn } from "@/lib/utils";

/** The LL mark: an ink tile with an italic serif monogram and a highlighter underline. */
export function BrandMark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const box = {
    sm: "size-8 rounded-lg text-base",
    md: "size-10 rounded-xl text-lg",
    lg: "size-16 rounded-2xl text-3xl",
  }[size];
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-grid shrink-0 place-items-center bg-primary font-display font-semibold text-primary-foreground italic shadow-(--shadow-press)",
        box,
        className,
      )}
    >
      <span className="relative -translate-y-[0.04em]">LL</span>
      <span className="absolute inset-x-[22%] bottom-[20%] h-[9%] rounded-full bg-highlight" />
    </span>
  );
}
