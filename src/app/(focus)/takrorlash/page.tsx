import type { Metadata } from "next";
import { uz } from "@/lib/i18n/uz";
import { SessionClient } from "./session-client";

export const metadata: Metadata = { title: uz.nav.review };

export default function ReviewPage() {
  return <SessionClient />;
}
