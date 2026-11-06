-- =====================================================================
-- Web Push reminders: pg_cron (every 5 min) → Edge Function
-- `send-reminders` → web-push. The database decides WHO gets a reminder
-- (claim_due_reminders); the function only sends.
--
-- One-time setup (SQL editor), see README "Push eslatmalar":
--   select vault.create_secret('https://<ref>.supabase.co', 'll_project_url');
--   select vault.create_secret('<random string>',            'll_cron_secret');
--   select vault.create_secret('<VAPID public key>',         'll_vapid_public_key');
--   select vault.create_secret('<VAPID private key>',        'll_vapid_private_key');
--   select vault.create_secret('https://<your app url>',     'll_vapid_subject');
-- The Edge Function reads them through reminder_config(), so no function
-- secrets are needed (env vars of the same meaning still take precedence).
-- =====================================================================

create extension if not exists pg_net;

-- One row per (user, local day, reminder time) that was already sent.
create table public.push_reminder_log (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  slot     time not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, day, slot)
);

alter table public.push_reminder_log enable row level security;
-- no policies: only the service role (Edge Function) touches it

/**
 * Returns users whose reminder time has come (within the last
 * p_window_minutes, in their own timezone), who have at least one push
 * subscription and something due. Each (user, day, time) is claimed once,
 * so overlapping cron runs never send twice.
 */
create or replace function public.claim_due_reminders(
  p_now timestamptz default now(),
  p_window_minutes int default 30
)
returns table (user_id uuid, due_count int, overdue_count int, subscriptions jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with slots as (
    select s.user_id, (p_now at time zone s.timezone) as local_ts, t.slot
    from public.settings s
    cross join unnest(s.reminder_times) as t (slot)
    where exists (select 1 from public.push_subscriptions ps where ps.user_id = s.user_id)
  ),
  matching as (
    select sl.user_id, sl.local_ts::date as day, sl.slot
    from slots sl
    where sl.local_ts::time >= sl.slot
      and sl.local_ts::time < sl.slot + make_interval(mins => p_window_minutes)
  ),
  counted as (
    select m.user_id, m.day, m.slot,
           count(c.id) filter (where c.due_date <= m.day)::int as due_n,
           count(c.id) filter (where c.due_date < m.day)::int as overdue_n
    from matching m
    left join public.cards c
      on c.user_id = m.user_id and c.status in ('learning', 'review', 'mastered')
    group by m.user_id, m.day, m.slot
  ),
  claimed as (
    insert into public.push_reminder_log as l (user_id, day, slot)
    select ct.user_id, ct.day, ct.slot from counted ct where ct.due_n > 0
    on conflict do nothing
    returning l.user_id, l.day, l.slot
  )
  select distinct on (cl.user_id)
    cl.user_id,
    ct.due_n,
    ct.overdue_n,
    (select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'keys', ps.keys))
       from public.push_subscriptions ps where ps.user_id = cl.user_id)
  from claimed cl
  join counted ct on ct.user_id = cl.user_id and ct.day = cl.day and ct.slot = cl.slot
  order by cl.user_id, cl.slot desc;
end;
$$;

revoke execute on function public.claim_due_reminders(timestamptz, int) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(timestamptz, int) to service_role;

-- Push configuration for the Edge Function (service role only).
create or replace function public.reminder_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in ('ll_cron_secret', 'll_vapid_public_key', 'll_vapid_private_key', 'll_vapid_subject');
$$;
revoke execute on function public.reminder_config() from public, anon, authenticated;
grant execute on function public.reminder_config() to service_role;

-- Keep the log small.
create or replace function public.prune_push_reminder_log()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_reminder_log where day < current_date - 14;
$$;
revoke execute on function public.prune_push_reminder_log() from public, anon, authenticated;

-- Calls the Edge Function; does nothing until the Vault secrets exist.
create or replace function public.invoke_send_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'll_project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'll_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke execute on function public.invoke_send_reminders() from public, anon, authenticated;

select cron.schedule('ll-send-reminders', '*/5 * * * *', $$select public.invoke_send_reminders();$$);
select cron.schedule('ll-prune-reminder-log', '30 3 * * *', $$select public.prune_push_reminder_log();$$);
