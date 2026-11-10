-- =====================================================================
-- Push reminders count WORDS the way the "Bugun" page does, instead of
-- cards: a word shows one direction a day, so a word with both directions
-- due is one review, not two ("26 ta takrorlash" for 13 words before).
-- Same signature and columns, so the Edge Function needs no change.
-- =====================================================================
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
           count(distinct c.item_id) filter (where c.due_date <= m.day)::int as due_n,
           count(distinct c.item_id) filter (where c.due_date < m.day)::int as overdue_n
    from matching m
    left join public.cards c
      on c.user_id = m.user_id
     and c.status in ('learning', 'review', 'mastered')
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
