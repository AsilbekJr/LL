-- "Start over": reset the caller's learning data in ONE transaction.
--   p_mode = 'all'      -> like a brand-new user: words, packs, cards, history,
--                          productions, texts and calendar history are deleted.
--   p_mode = 'progress' -> keep the words; every card (except suspended ones)
--                          becomes new again, history and productions are
--                          deleted, started texts restart from zero.
--   p_reset_settings    -> also restore default settings (timezone is kept).
-- Push subscriptions and the reminder log are not learning data and are kept.
-- SECURITY DEFINER because daily_snapshots has no delete policy; every
-- statement is limited to auth.uid(), and only signed-in users may call it.
create or replace function public.reset_my_data(p_mode text, p_reset_settings boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tz text;
  today date;
  n_items int := 0;
  n_cards int := 0;
  n_reviews int := 0;
  n_productions int := 0;
  n_texts int := 0;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_mode not in ('all', 'progress') then
    raise exception 'invalid mode: %', p_mode using errcode = '22023';
  end if;

  select coalesce(s.timezone, 'Asia/Tashkent') into tz from public.settings s where s.user_id = uid;
  today := public.today_tz(coalesce(tz, 'Asia/Tashkent'));

  delete from public.review_logs where user_id = uid;
  get diagnostics n_reviews = row_count;
  delete from public.productions where user_id = uid;
  get diagnostics n_productions = row_count;
  delete from public.daily_snapshots where user_id = uid;

  if p_mode = 'all' then
    delete from public.reading_texts where user_id = uid;
    get diagnostics n_texts = row_count;
    select count(*) into n_cards from public.cards where user_id = uid;
    delete from public.items where user_id = uid; -- cascades to cards
    get diagnostics n_items = row_count;
    delete from public.packs where user_id = uid;
  else
    update public.cards
       set stage = 1, ladder_step = 0, due_date = today, last_reviewed_at = null,
           lapses = 0, reps = 0, status = 'new', fsrs_state = null
     where user_id = uid and status <> 'suspended';
    get diagnostics n_cards = row_count;
    update public.reading_texts
       set repetitions = 0, due_date = today, last_score = null, last_practiced_at = null
     where user_id = uid;
    get diagnostics n_texts = row_count;
  end if;

  if p_reset_settings then
    update public.settings
       set daily_new_limit = default, daily_review_limit = default, ladder = default,
           srs_mode = default, reminder_times = default, direction_mode = default,
           tts_voice = default, tts_rate = default, overdue_penalty = default,
           production_gate_steps = default, maintenance_days = default, theme = default
     where user_id = uid;
  end if;

  return jsonb_build_object(
    'mode', p_mode,
    'items', n_items,
    'cards', n_cards,
    'reviews', n_reviews,
    'productions', n_productions,
    'texts', n_texts,
    'settings', p_reset_settings
  );
end;
$$;

revoke all on function public.reset_my_data(text, boolean) from public, anon;
grant execute on function public.reset_my_data(text, boolean) to authenticated;
