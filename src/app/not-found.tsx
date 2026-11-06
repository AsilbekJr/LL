import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <EmptyState
        className="w-full"
        icon={SearchX}
        title={uz.common.notFoundTitle}
        description={uz.common.notFoundBody}
        action={
          <Button asChild>
            <Link href="/bugun">{uz.common.backHome}</Link>
          </Button>
        }
      />
    </main>
  );
}
