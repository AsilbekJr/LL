import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { uz } from "@/lib/i18n/uz";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: uz.nav.import };

export default function ImportPage() {
  return (
    <>
      <PageHeader title={uz.nav.import} description={uz.import.description} />
      <ImportClient />
    </>
  );
}
