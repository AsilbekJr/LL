import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.library };

export default function LibraryPage() {
  return (
    <ComingSoon
      title={uz.nav.library}
      phase={3}
      description="Qidiruv va filtrlar (holat, CEFR, teg, tur, kechikkan), tahrirlash, to'xtatish, o'chirish."
    />
  );
}
