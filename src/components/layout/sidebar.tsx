"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/common/brand-mark";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { cn } from "@/lib/utils";
import { uz } from "@/lib/i18n/uz";
import { NAV_ITEMS, isActive } from "./nav-items";

// Desktop menu grouped by intent: daily study first, then tracking, then tools.
const GROUPS: { label: string; hrefs: string[] }[] = [
  { label: "O'qish", hrefs: ["/bugun", "/qoshish", "/kutubxona", "/yodlanganlar", "/nutq"] },
  { label: "Kuzatish", hrefs: ["/kalendar", "/statistika"] },
  { label: "Boshqa", hrefs: ["/import", "/sozlamalar"] },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card/60 px-3 py-5 md:flex">
      <Link
        href="/bugun"
        className="mb-6 flex items-center gap-3 rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <BrandMark size="md" />
        <span className="leading-tight">
          <span className="block font-display text-lg font-semibold">{uz.app.brand}</span>
          <span className="block text-xs text-muted-foreground">{uz.app.tagline}</span>
        </span>
      </Link>

      <nav aria-label="Asosiy menyu" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {NAV_ITEMS.filter((i) => group.hrefs.includes(i.href)).map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors outline-none",
                        "focus-visible:ring-2 focus-visible:ring-ring/50",
                        active
                          ? "bg-primary-soft text-primary-soft-foreground"
                          : "text-muted-foreground hover:bg-sunken hover:text-foreground",
                      )}
                    >
                      {active ? (
                        <span
                          className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-primary"
                          aria-hidden
                        />
                      ) : null}
                      <Icon className="size-[18px]" aria-hidden strokeWidth={active ? 2.3 : 2} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-2 border-t pt-4">
        <ThemeToggle />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:bg-destructive-soft hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <LogOut className="size-[18px]" aria-hidden />
            {uz.nav.signOut}
          </button>
        </form>
      </div>
    </aside>
  );
}
