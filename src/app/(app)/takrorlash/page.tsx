import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.review };

export default function ReviewPage() {
  return (
    <ComingSoon
      title={uz.nav.review}
      phase={4}
      description="To'liq ekranli takrorlash: tanishish, test, flashcard, yozish, tinglash, bo'sh joyni to'ldirish."
    />
  );
}
