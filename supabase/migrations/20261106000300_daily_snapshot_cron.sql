-- =====================================================================
-- Nightly calendar snapshot (pg_cron).
-- Runs at 19:05 UTC = 00:05 Asia/Tashkent and records the day that just
-- ended for every user. Missed cards are NOT moved: a card whose due_date
-- is in the past simply stays due and is shown first (overdue) — the
-- rollover is implicit, so a card can never be lost.
-- (Push reminders are scheduled in a later migration, phase 6.)
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.write_daily_snapshots()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.daily_snapshots (user_id, day, due_count, done_count, missed_count, reviews_count)
  select
    s.user_id,
    d.day,
    coalesce(done.cards, 0) + coalesce(missed.cards, 0),
    coalesce(done.cards, 0),
    coalesce(missed.cards, 0),
    coalesce(done.reviews, 0)
  from public.settings s
  cross join lateral (select public.today_tz(s.timezone) - 1 as day) d
  left join lateral (
    select count(distinct rl.card_id)::int as cards, count(*)::int as reviews
    from public.review_logs rl
    where rl.user_id = s.user_id
      and (rl.reviewed_at at time zone s.timezone)::date = d.day
      and rl.result is not null
  ) done on true
  left join lateral (
    select count(*)::int as cards
    from public.cards c
    where c.user_id = s.user_id
      and c.status in ('learning', 'review', 'mastered')
      and c.due_date <= d.day
  ) missed on true
  on conflict (user_id, day) do update
    set due_count     = excluded.due_count,
        done_count    = excluded.done_count,
        missed_count  = excluded.missed_count,
        reviews_count = excluded.reviews_count;
end;
$$;

revoke execute on function public.write_daily_snapshots() from public, anon, authenticated;

select cron.schedule(
  'll-daily-snapshots',
  '5 19 * * *',
  $$select public.write_daily_snapshots();$$
);
