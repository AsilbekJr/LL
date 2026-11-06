import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { uz } from "@/lib/i18n/uz";
import { CalendarClient } from "./calendar-client";

export const metadata: Metadata = { title: uz.nav.calendar };

export default function CalendarPage() {
  return (
    <>
      <PageHeader title={uz.nav.calendar} description={uz.calendar.description} />
      <CalendarClient />
    </>
  );
}
