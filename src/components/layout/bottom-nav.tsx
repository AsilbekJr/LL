"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PRIMARY_TAB, TAB_ITEMS, isActive } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Asosiy menyu"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:hidden"
    >
      <ul className="mx-auto grid h-[4.25rem] max-w-lg grid-cols-5 items-center px-1">
        {TAB_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);

          if (href === PRIMARY_TAB) {
            return (
              <li key={href} className="flex justify-center">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className="-mt-5 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-(--shadow-lift) ring-4 ring-background transition-transform duration-150 outline-none focus-visible:ring-ring/60 active:scale-95"
                >
                  <Icon className="size-7" aria-hidden strokeWidth={2.25} />
                </Link>
              </li>
            );
          }

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="group flex h-[4.25rem] flex-col items-center justify-center gap-1 text-[11px] font-semibold outline-none"
              >
                <span
                  className={cn(
                    "grid h-8 w-14 place-items-center rounded-full transition-colors duration-200",
                    "group-focus-visible:ring-2 group-focus-visible:ring-ring/60",
                    active
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <Icon className="size-[22px]" aria-hidden strokeWidth={active ? 2.3 : 1.9} />
                </span>
                <span
                  className={cn(
                    "max-w-full truncate px-1",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
