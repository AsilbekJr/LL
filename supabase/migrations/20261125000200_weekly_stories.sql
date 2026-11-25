-- Haftalik hikoya: at the end of each week a short story is written from the
-- words studied that week, at a level the learner picks. The learner reads
-- and listens, memorizes it part by part, then retells it aloud (the retell
-- is saved as spoken productions, so the words count towards "active").
create table if not exists public.weekly_stories (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Monday of the story's week (in the learner's timezone)
  week_start       date not null,
  level            text not null check (level in (
                     'beginner', 'elementary', 'pre_intermediate',
                     'intermediate', 'upper_intermediate', 'ielts')),
  title            text not null check (length(btrim(title)) between 1 and 200),
  -- {title_uz, parts: [{en, uz}], outline_uz: [..]}
  story            jsonb not null check (jsonb_typeof(story) = 'object' and pg_column_size(story) <= 60000),
  -- [{id, english, uzbek}] the target words of the week
  words            jsonb not null default '[]'::jsonb
                     check (jsonb_typeof(words) = 'array' and jsonb_array_length(words) <= 20),
  memorized_parts  int not null default 0 check (memorized_parts between 0 and 20),
  best_retell      int check (best_retell between 0 and 100),
  retold_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, week_start, level)
);

create index if not exists weekly_stories_user_week_idx on public.weekly_stories (user_id, week_start desc);

drop trigger if exists weekly_stories_updated_at on public.weekly_stories;
create trigger weekly_stories_updated_at before update on public.weekly_stories
  for each row execute function public.set_updated_at();

alter table public.weekly_stories enable row level security;

drop policy if exists weekly_stories_select_own on public.weekly_stories;
drop policy if exists weekly_stories_insert_own on public.weekly_stories;
drop policy if exists weekly_stories_update_own on public.weekly_stories;
drop policy if exists weekly_stories_delete_own on public.weekly_stories;
create policy weekly_stories_select_own on public.weekly_stories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy weekly_stories_insert_own on public.weekly_stories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy weekly_stories_update_own on public.weekly_stories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy weekly_stories_delete_own on public.weekly_stories
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.weekly_stories from anon;

-- "Start over" also clears the weekly stories (learning history).
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
  delete from public.weekly_stories where user_id = uid;

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
