-- Graded texts the learner practises ("Matn zinapoyasi"): built-in texts are
-- copied in when started; AI texts are generated from the learner's words.
-- The text itself is repeated on a spaced schedule (1, 3, 7, 16, 35 days).
create table public.reading_texts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source            text not null check (source in ('builtin', 'ai')),
  builtin_id        text,
  level             text not null check (level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  title             text not null check (length(title) between 1 and 200),
  title_uz          text not null default '' check (length(title_uz) <= 200),
  -- [[english, uzbek], ...]
  sentences         jsonb not null check (jsonb_typeof(sentences) = 'array' and jsonb_array_length(sentences) between 1 and 60),
  key_words         text[] not null default '{}',
  repetitions       smallint not null default 0 check (repetitions >= 0),
  due_date          date,
  last_score        real check (last_score between 0 and 1),
  last_practiced_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, builtin_id)
);

create index reading_texts_user_due_idx on public.reading_texts (user_id, due_date);

create trigger reading_texts_updated_at before update on public.reading_texts
  for each row execute function public.set_updated_at();

alter table public.reading_texts enable row level security;

create policy reading_texts_select_own on public.reading_texts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy reading_texts_insert_own on public.reading_texts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy reading_texts_update_own on public.reading_texts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reading_texts_delete_own on public.reading_texts
  for delete to authenticated using ((select auth.uid()) = user_id);
