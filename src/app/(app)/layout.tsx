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
      <Sidebar />
      <main
        id="main"
        className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-10"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
