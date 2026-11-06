"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { uz } from "@/lib/i18n/uz";
import { NAV_ITEMS, isActive } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card/50 p-3 md:flex">
      <Link href="/bugun" className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-lg font-bold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm text-primary-foreground">
          LL
        </span>
        So&apos;z yodlash
      </Link>
      <nav aria-label="Asosiy menyu" className="flex-1">
        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-[18px]" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <LogOut className="size-[18px]" aria-hidden />
          {uz.nav.signOut}
        </button>
      </form>
    </aside>
  );
}
