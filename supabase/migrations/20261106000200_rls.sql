-- =====================================================================
-- Row Level Security: every row belongs to exactly one user.
-- (select auth.uid()) is used instead of auth.uid() so Postgres evaluates
-- it once per statement (Supabase performance recommendation).
-- =====================================================================

alter table public.packs              enable row level security;
alter table public.items              enable row level security;
alter table public.cards              enable row level security;
alter table public.review_logs        enable row level security;
alter table public.productions        enable row level security;
alter table public.settings           enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.daily_snapshots    enable row level security;

-- Owner-only CRUD for the user-editable tables.
do $$
declare
  t text;
begin
  foreach t in array array['packs', 'items', 'cards', 'review_logs', 'productions', 'push_subscriptions']
  loop
    execute format(
      'create policy %1$s_select_own on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_insert_own on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_update_own on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_delete_own on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- Settings: row is created by trigger; user may read and update only.
create policy settings_select_own on public.settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy settings_update_own on public.settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- Allow insert too, so the client can self-heal if the row is somehow missing.
create policy settings_insert_own on public.settings
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Snapshots are written by pg_cron (bypasses RLS); the user can only read.
create policy daily_snapshots_select_own on public.daily_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
revoke execute on function public.schedule_items(uuid[]) from anon, public;
grant execute on function public.schedule_items(uuid[]) to authenticated;
