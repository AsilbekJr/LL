// Supabase Edge Function (Deno). Called every 5 minutes by pg_cron
// (public.invoke_send_reminders) — see migration *_push_reminders.sql.
//
// Secrets (supabase secrets set ...):
//   CRON_SECRET        same random string as the Vault secret ll_cron_secret
//   VAPID_PUBLIC_KEY   = NEXT_PUBLIC_VAPID_PUBLIC_KEY of the web app
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT      e.g. mailto:you@example.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { reminderMessage } from "./message.ts";

interface Row {
  user_id: string;
  due_count: number;
  overdue_count: number;
  subscriptions: { id: string; endpoint: string; keys: { p256dh: string; auth: string } }[] | null;
}

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Missing env ${k}`);
  return v;
};

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  webpush.setVapidDetails(env("VAPID_SUBJECT"), env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data, error } = await sb.rpc("claim_due_reminders");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const row of (data ?? []) as Row[]) {
    const payload = JSON.stringify(reminderMessage(row.due_count, row.overdue_count));
    for (const sub of row.subscriptions ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, {
          TTL: 6 * 60 * 60,
          urgency: "normal",
        });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // Subscription expired or was revoked in the browser.
          await sb.from("push_subscriptions").delete().eq("id", sub.id);
          removed++;
        } else {
          failed++;
          console.error("push failed", status, (e as Error).message);
        }
      }
    }
  }

  return Response.json({ users: (data ?? []).length, sent, removed, failed });
});
