import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.speaking };

export default function SpeakingDrillPage() {
  return (
    <ComingSoon
      title={uz.nav.speaking}
      phase={5}
      description="Kunlik IELTS uslubidagi savol: bugungi 3–5 so'zni ishlatib 60–120 soniya gapiring."
    />
  );
}
