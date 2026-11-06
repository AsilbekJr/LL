import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.settings };

export default function SettingsPage() {
  return (
    <ComingSoon
      title={uz.nav.settings}
      phase={2}
      description="Interval zinapoyasi, kunlik limitlar, yo'nalish, SRS rejimi, eslatma vaqtlari, TTS ovozi."
    />
  );
}
