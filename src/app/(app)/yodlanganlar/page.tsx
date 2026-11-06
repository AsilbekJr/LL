import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { uz } from "@/lib/i18n/uz";
import { MasteredClient } from "./mastered-client";

export const metadata: Metadata = { title: uz.nav.mastered };

export default function MasteredPage() {
  return (
    <>
      <PageHeader title={uz.nav.mastered} />
      <MasteredClient />
    </>
  );
}
