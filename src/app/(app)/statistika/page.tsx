import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { uz } from "@/lib/i18n/uz";
import { StatsClient } from "./stats-client";

export const metadata: Metadata = { title: uz.nav.stats };

export default function StatsPage() {
  return (
    <>
      <PageHeader title={uz.nav.stats} description={uz.stats.description} />
      <StatsClient />
    </>
  );
}
