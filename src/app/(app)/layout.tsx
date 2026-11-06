import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUserId } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Second line of defence (the proxy already redirects).
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Asosiy qismga o&apos;tish
      </a>
      <Sidebar />
      <main
        id="main"
        className="animate-rise mx-auto w-full max-w-3xl flex-1 px-5 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:px-10 md:pt-12 md:pb-12"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
