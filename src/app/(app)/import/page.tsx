import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.import };

export default function ImportPage() {
  return (
    <ComingSoon
      title={uz.nav.import}
      phase={3}
      description="JSON to'plam yuklash (A1–C2), ko'rib chiqish jadvali, dublikatlarni o'tkazib yuborish, zaxira nusxa."
    />
  );
}
