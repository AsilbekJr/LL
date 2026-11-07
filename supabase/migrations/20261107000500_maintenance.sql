-- Long-running hygiene, so the project keeps working months from now.
--
-- 1. pg_cron keeps a row per job run forever. `ll-send-reminders` runs every
--    5 minutes (~290 rows a day, ~100k a year). Keep two weeks of history.
-- 2. Foreign keys without a covering index (Supabase advisor): deletes of
--    items / cards (and the reset) scan these tables in full as they grow.

create or replace function public.prune_cron_history()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from cron.job_run_details where end_time < now() - interval '14 days';
$$;

revoke execute on function public.prune_cron_history() from public, anon, authenticated;

select cron.schedule('ll-prune-cron-history', '45 3 * * *', $$select public.prune_cron_history();$$);

create index if not exists cards_item_user_idx on public.cards (item_id, user_id);
create index if not exists productions_card_idx on public.productions (card_id);
create index if not exists productions_item_user_idx on public.productions (item_id, user_id);
create index if not exists review_logs_card_user_idx on public.review_logs (card_id, user_id);
