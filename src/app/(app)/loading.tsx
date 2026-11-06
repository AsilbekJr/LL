import { uz } from "@/lib/i18n/uz";

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">{uz.common.loading}</span>
      <div className="mb-2 h-3 w-28 rounded-full bg-sunken" />
      <div className="mb-8 h-9 w-52 rounded-lg bg-sunken" />
      <div className="h-48 rounded-2xl bg-sunken" />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[5.5rem] rounded-xl bg-sunken" />
        ))}
      </div>
    </div>
  );
}
