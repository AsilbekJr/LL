import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { uz } from "@/lib/i18n/uz";
import { AddClient } from "./add-client";

export const metadata: Metadata = { title: uz.nav.add };

export default function AddPage() {
  return (
    <>
      <PageHeader title={uz.nav.add} description={uz.add.description} />
      <AddClient />
    </>
  );
}
