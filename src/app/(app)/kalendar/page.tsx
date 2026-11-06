import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.calendar };

export default function CalendarPage() {
  return (
    <ComingSoon
      title={uz.nav.calendar}
      phase={6}
      description="Oylik ko'rinish (bajarilgan / kechikkan / rejadagi), 12 oylik heatmap va streak tarixi."
    />
  );
}
