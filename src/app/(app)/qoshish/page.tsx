import type { Metadata } from "next";
import { ComingSoon } from "@/components/common/coming-soon";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.nav.add };

export default function AddPage() {
  return (
    <ComingSoon
      title={uz.nav.add}
      phase={3}
      description="Tez qo'shish formasi va “ro'yxatni joylash” rejimi (english — uzbek, har qatorda bittadan)."
    />
  );
}
