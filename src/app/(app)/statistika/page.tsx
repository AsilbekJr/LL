import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.stats };

export default function StatsPage() {
  return (
    <ComingSoon
      title={uz.nav.stats}
      phase={6}
      description="Eslab qolish foizi, kunlik takrorlashlar, bosqichlar, eng qiyin so'zlar, haftalik gapirish daqiqalari."
    />
  );
}
