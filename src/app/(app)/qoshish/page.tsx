import type { Metadata } from "next";
import { aiFeedbackEnabled, aiProvider } from "@/lib/ai/config";
import { PageHeader } from "@/components/common/page-header";
import { uz } from "@/lib/i18n/uz";
import { sharedWord } from "@/lib/items/shared-text";
import { AddClient } from "./add-client";

export const metadata: Metadata = { title: uz.nav.add };

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ text?: string | string[]; title?: string | string[] }>;
}) {
  // Opened from the phone's share sheet: the shared selection becomes the word.
  const sp = await searchParams;
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
  const shared = sharedWord({ text: one(sp.text), title: one(sp.title) });
  return (
    <>
      <PageHeader title={uz.nav.add} description={uz.add.description} />
      <AddClient aiEnabled={aiFeedbackEnabled() && aiProvider() === "gemini"} shared={shared || undefined} />
    </>
  );
}
