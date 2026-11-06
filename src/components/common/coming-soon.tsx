import { Hammer } from "lucide-react";
import { EmptyState } from "./empty-state";
import { PageHeader } from "./page-header";
import { uz } from "@/lib/i18n/uz";

/** Placeholder used by screens that are implemented in a later phase. */
export function ComingSoon({
  title,
  phase,
  description,
}: {
  title: string;
  phase: number;
  description: string;
}) {
  return (
    <>
      <PageHeader eyebrow={`${phase}-faza`} title={title} />
      <EmptyState icon={Hammer} title={uz.common.comingInPhase(phase)} description={description} />
    </>
  );
}
