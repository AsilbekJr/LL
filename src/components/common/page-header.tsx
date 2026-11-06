import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /** Small uppercase line above the title (e.g. today's date). */
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex items-end justify-between gap-3 md:mb-8">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-[2rem] leading-[1.1] font-semibold md:text-4xl">{title}</h1>
        {description ? <p className="mt-2 text-[0.95rem] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
