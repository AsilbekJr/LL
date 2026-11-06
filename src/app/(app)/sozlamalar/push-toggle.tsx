"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/form-controls";
import {
  currentSubscription,
  pushSupport,
  subscribe,
  toRow,
  type PushSupport,
} from "@/lib/push/subscription";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uz } from "@/lib/i18n/uz";

type State = "loading" | "on" | "off";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = uz.settings;
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = pushSupport();
    let alive = true;
    void (async () => {
      const sub = s === "ok" ? await currentSubscription().catch(() => null) : null;
      if (!alive) return;
      setSupport(s);
      setState(sub ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(null);
    try {
      const sub = await subscribe(vapidPublicKey);
      const { error: dbError } = await getSupabaseBrowserClient()
        .from("push_subscriptions")
        .upsert({ ...toRow(sub), user_agent: navigator.userAgent.slice(0, 300) }, { onConflict: "endpoint" });
      if (dbError) throw dbError;
      setState("on");
    } catch (e) {
      setError(e instanceof Error && e.message === "denied" ? t.pushDenied : t.pushError);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await getSupabaseBrowserClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError(t.pushError);
    } finally {
      setBusy(false);
    }
  }

  const note =
    support === null
      ? null
      : !vapidPublicKey
        ? t.pushNotConfigured
        : support === "ios-needs-install"
          ? t.pushIos
          : support === "unsupported"
            ? t.pushUnsupported
            : typeof Notification !== "undefined" && Notification.permission === "denied"
              ? t.pushDenied
              : null;
  const usable = support === "ok" && Boolean(vapidPublicKey);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-background/60 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-soft-foreground">
          {state === "on" ? (
            <Bell className="size-5" aria-hidden />
          ) : (
            <BellOff className="size-5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            {t.push}
            {state !== "loading" && usable ? (
              <Badge tone={state === "on" ? "success" : "neutral"}>
                {state === "on" ? t.pushOn : t.pushOff}
              </Badge>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.pushHint}</p>
        </div>
      </div>
      {note ? <p className="text-sm text-warning">{note}</p> : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      {usable && state !== "loading" ? (
        <Button
          type="button"
          variant={state === "on" ? "outline" : "default"}
          className="self-start"
          disabled={busy}
          onClick={state === "on" ? disable : enable}
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {state === "on" ? t.pushDisable : t.pushEnable}
        </Button>
      ) : null}
    </div>
  );
}
