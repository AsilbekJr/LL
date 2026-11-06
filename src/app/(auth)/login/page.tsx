import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/common/brand-mark";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.auth.title };

// Sample "page" from the notebook shown on wide screens.
const SAMPLE = [
  { en: "to look forward to", uz: "intiqlik bilan kutmoq" },
  { en: "a piece of cake", uz: "juda oson ish" },
  { en: "to keep up with", uz: "ortda qolmaslik" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  // Read ?next= on the server: with useSearchParams() the whole form would only
  // render after JavaScript loads (client-side bailout), delaying LCP by seconds.
  const { next } = await searchParams;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel (desktop) */}
      <aside className="bg-ruled relative hidden overflow-hidden border-r bg-card lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <BrandMark size="md" />
          <span className="font-display text-xl font-semibold">{uz.app.brand}</span>
        </div>

        <div className="max-w-md">
          <p className="font-display text-4xl leading-[1.15] font-semibold">
            So&apos;zni yodlash emas — <span className="mark-highlight italic">ishlatish</span> muhim.
          </p>
          <p className="mt-4 text-muted-foreground">{uz.app.description}.</p>

          <ul className="mt-10 flex flex-col gap-3" aria-label="Namuna">
            {SAMPLE.map((w, i) => (
              <li
                key={w.en}
                className="flex items-baseline justify-between gap-6 rounded-xl border bg-background/70 px-4 py-3 shadow-(--shadow-soft)"
                style={{ transform: `rotate(${[-0.6, 0.4, -0.2][i]}deg)` }}
              >
                <span className="font-display text-lg italic">{w.en}</span>
                <span className="text-sm text-muted-foreground">{w.uz}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">{uz.app.tagline}</p>
      </aside>

      {/* Form */}
      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="animate-rise mx-auto w-full max-w-sm">
          <div className="mb-8">
            <BrandMark size="lg" className="mb-6 lg:hidden" />
            <h1 className="font-display text-4xl font-semibold">{uz.auth.title}</h1>
            <p className="mt-2 text-muted-foreground">{uz.auth.subtitle}</p>
          </div>
          <LoginForm next={typeof next === "string" ? next : null} />
        </div>
      </main>
    </div>
  );
}
