// Supabase Edge Function (Deno). Called every 5 minutes by pg_cron
// (public.invoke_send_reminders) — see migration *_push_reminders.sql.
//
// Configuration comes from Supabase Vault via public.reminder_config():
//   ll_cron_secret, ll_vapid_public_key, ll_vapid_private_key, ll_vapid_subject
// Function secrets CRON_SECRET / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
// VAPID_SUBJECT, if set, take precedence. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
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
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data: cfg } = await sb.rpc("reminder_config");
  const vault = (cfg ?? {}) as Record<string, string | undefined>;
  const pick = (envName: string, vaultName: string) => Deno.env.get(envName) || vault[vaultName] || "";

  const secret = pick("CRON_SECRET", "ll_cron_secret");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const subject = pick("VAPID_SUBJECT", "ll_vapid_subject");
  const publicKey = pick("VAPID_PUBLIC_KEY", "ll_vapid_public_key");
  const privateKey = pick("VAPID_PRIVATE_KEY", "ll_vapid_private_key");
  if (!subject || !publicKey || !privateKey) {
    return Response.json({ error: "VAPID keys are not configured" }, { status: 500 });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

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
