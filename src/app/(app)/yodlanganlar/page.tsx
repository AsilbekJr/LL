import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.mastered };

export default function MasteredPage() {
  return (
    <ComingSoon
      title={uz.nav.mastered}
      phase={5}
      description="To'liq yodlangan so'zlar va ular bilan siz yozgan/aytgan gaplar."
    />
  );
}
