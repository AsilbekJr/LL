import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { uz } from "@/lib/i18n/uz";

export const metadata: Metadata = { title: uz.auth.title };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">
          LL
        </div>
        <h1 className="text-2xl font-bold">{uz.auth.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{uz.auth.subtitle}</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
