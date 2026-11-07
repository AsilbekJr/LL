"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { reloadForStaleBuild } from "@/lib/app/stale-build";
import { uz } from "@/lib/i18n/uz";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // An old tab after a new deploy: one reload loads the new build.
    if (reloadForStaleBuild(error)) return;
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title={uz.common.errorTitle}
      description={uz.common.errorBody}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>{uz.common.retry}</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {uz.common.reload}
          </Button>
        </div>
      }
    />
  );
}
