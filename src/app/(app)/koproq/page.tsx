import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { MORE_ITEMS } from "@/components/layout/nav-items";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.more };

export default function MorePage() {
  return (
    <>
      <PageHeader title={uz.nav.more} />

      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-(--shadow-soft)">
        {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-16 items-center gap-4 px-4 text-base font-semibold outline-none hover:bg-sunken focus-visible:bg-sunken"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      <section
        aria-labelledby="theme-title"
        className="mt-6 rounded-2xl border bg-card p-4 shadow-(--shadow-soft)"
      >
        <h2 id="theme-title" className="mb-3 text-sm font-semibold">
          {uz.theme.label}
        </h2>
        <ThemeToggle />
      </section>

      <form action="/auth/signout" method="post" className="mt-6">
        <button
          type="submit"
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border bg-card text-base font-semibold text-destructive shadow-(--shadow-soft) outline-none hover:bg-destructive-soft focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <LogOut className="size-5" aria-hidden />
          {uz.nav.signOut}
        </button>
      </form>
    </>
  );
}
