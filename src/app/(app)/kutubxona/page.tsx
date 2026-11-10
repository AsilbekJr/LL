import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";
import { LibraryClient } from "./library-client";

export const metadata: Metadata = { title: uz.nav.library };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ qiyin?: string }> }) {
  const { qiyin } = await searchParams;
  return (
    <>
      <PageHeader
        title={uz.nav.library}
        actions={
          <Button asChild size="sm" className="hidden md:inline-flex">
            <Link href="/qoshish">
              <Plus aria-hidden />
              {uz.add.submit}
            </Link>
          </Button>
        }
      />
      <LibraryClient hardOnly={qiyin === "1"} />
    </>
  );
}
