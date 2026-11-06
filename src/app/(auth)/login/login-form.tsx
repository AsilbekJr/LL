"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uz } from "@/lib/i18n/uz";

interface LoginValues {
  email: string;
  password: string;
}

// Plain rules instead of zod: the login page is the only public page and
// stays light. Supabase is loaded only when the form is submitted.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only allow same-origin relative redirects (prevents open redirect). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/bugun";
}

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!navigator.onLine) {
      setFormError(uz.auth.network);
      return;
    }
    const { getSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
      email: values.email.trim(),
      password: values.password,
    });
    if (error) {
      setFormError(uz.auth.failed);
      return;
    }
    // refresh() re-runs server components with the fresh session cookie.
    router.replace(safeNext(next) as Route);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{uz.auth.email}</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          {...register("email", {
            validate: (v) => EMAIL_RE.test(v.trim()) || uz.auth.invalidEmail,
          })}
        />
        {errors.email ? (
          <p id="email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{uz.auth.password}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password", {
            required: uz.auth.passwordMin,
            minLength: { value: 6, message: uz.auth.passwordMin },
          })}
        />
        {errors.password ? (
          <p id="password-error" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {isSubmitting ? uz.auth.submitting : uz.auth.submit}
      </Button>
    </form>
  );
}
