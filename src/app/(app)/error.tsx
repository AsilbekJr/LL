"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title={uz.common.errorTitle}
      description={uz.common.errorBody}
      action={<Button onClick={reset}>{uz.common.retry}</Button>}
    />
  );
}
