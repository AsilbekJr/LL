import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.common.offlineTitle };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <EmptyState
        className="w-full"
        icon={WifiOff}
        title={uz.common.offlineTitle}
        description={uz.common.offlineBody}
      />
    </main>
  );
}
