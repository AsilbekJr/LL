import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { aiFeedbackEnabled, aiProvider } from "@/lib/ai/config";
import { uz } from "@/lib/i18n/uz";
import { TextsClient } from "./texts-client";

export const metadata: Metadata = { title: uz.nav.texts };

export default function TextsPage() {
  return (
    <>
      <PageHeader title={uz.nav.texts} description={uz.texts.description} />
      <TextsClient aiEnabled={aiFeedbackEnabled() && aiProvider() === "gemini"} />
    </>
  );
}
