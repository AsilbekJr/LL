import { uz } from "@/lib/i18n/uz";

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">{uz.common.loading}</span>
      <div className="mb-5 h-8 w-40 rounded-lg bg-muted" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted" />
        ))}
      </div>
      <div className="mt-6 h-14 rounded-lg bg-muted" />
    </div>
  );
}
