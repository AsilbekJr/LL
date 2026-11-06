import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { MORE_ITEMS } from "@/components/layout/nav-items";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.more };

export default function MorePage() {
  return (
    <>
      <PageHeader title={uz.nav.more} />
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-14 items-center gap-3 px-4 text-base hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <Icon className="size-5 text-muted-foreground" aria-hidden />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <form action="/auth/signout" method="post" className="mt-4">
        <button
          type="submit"
          className="flex h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 text-base text-destructive hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <LogOut className="size-5" aria-hidden />
          {uz.nav.signOut}
        </button>
      </form>
    </>
  );
}
