-- =====================================================================
-- LL — SRS app: core schema
-- All "day" values (due_date, snapshot day) are calendar dates in the
-- user's timezone (default Asia/Tashkent), never UTC dates.
-- =====================================================================

-- ---------- helpers ---------------------------------------------------

-- Today's calendar date in a given IANA timezone.
create or replace function public.today_tz(tz text default 'Asia/Tashkent')
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone tz)::date;
$$;

-- Generic updated_at trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Ladder must be non-empty, strictly ascending, all positive.
create or replace function public.is_valid_ladder(l int[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_length(l, 1), 0) between 2 and 30
     and not exists (
       select 1
       from unnest(l) with ordinality as a(v, i)
       where a.v <= 0
          or (a.i > 1 and a.v <= l[a.i - 1])
     );
$$;

-- ---------- packs -----------------------------------------------------

create table public.packs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 200),
  cefr_level   text check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  description  text check (length(description) <= 2000),
  item_count   int not null default 0 check (item_count >= 0),
  imported_at  timestamptz not null default now()
);

create index packs_user_idx on public.packs (user_id);

-- ---------- items -----------------------------------------------------

create table public.items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type            text not null check (type in ('word', 'phrase', 'sentence')),
  english         text not null check (length(btrim(english)) between 1 and 500),
  uzbek           text not null check (length(btrim(uzbek)) between 1 and 500),
  cefr_level      text check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  part_of_speech  text check (length(part_of_speech) <= 40),
  example_en      text check (length(example_en) <= 1000),
  example_uz      text check (length(example_uz) <= 1000),
  notes           text check (length(notes) <= 2000),
  tags            text[] not null default '{}',
  source          text not null default 'manual' check (source in ('manual', 'import')),
  pack_id         uuid references public.packs (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- target for composite FKs so child rows can never belong to another user
  unique (id, user_id)
);

-- Duplicate protection (spec: unique on (user_id, lower(english))).
-- An expression cannot be a table constraint, so this is a unique index.
create unique index items_user_english_uniq on public.items (user_id, lower(btrim(english)));
create index items_user_created_idx on public.items (user_id, created_at desc);
create index items_tags_gin on public.items using gin (tags);
create index items_pack_idx on public.items (pack_id);

create trigger items_updated_at before update on public.items
  for each row execute function public.set_updated_at();

-- ---------- cards (one per item per direction) ------------------------

create table public.cards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid(),
  item_id           uuid not null,
  direction         text not null check (direction in ('en_uz', 'uz_en')),
  -- method stage 1..6 lives on the card; 7..9 are item-level (see productions)
  stage             smallint not null default 1 check (stage between 1 and 9),
  ladder_step       smallint not null default 0 check (ladder_step >= 0),
  due_date          date not null default public.today_tz(),
  last_reviewed_at  timestamptz,
  lapses            int not null default 0 check (lapses >= 0),
  reps              int not null default 0 check (reps >= 0),
  status            text not null default 'new'
                      check (status in ('new', 'learning', 'review', 'mastered', 'suspended')),
  fsrs_state        jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (item_id, direction),
  unique (id, user_id),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);

create index cards_user_due_idx on public.cards (user_id, due_date);
create index cards_user_status_idx on public.cards (user_id, status);

create trigger cards_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

-- ---------- review_logs -----------------------------------------------

create table public.review_logs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid(),
  card_id             uuid not null,
  -- generated on the device; makes offline re-sync idempotent
  client_id           uuid not null unique default gen_random_uuid(),
  reviewed_at         timestamptz not null default now(),
  method              text not null check (method in (
                        'encounter', 'recognition', 'recall', 'spelling', 'listening',
                        'cloze', 'word_order', 'writing', 'speaking', 'shadowing', 'drill')),
  -- null only for ungraded methods (encounter)
  result              text check (result in ('again', 'hard', 'good', 'easy')),
  response_text       text check (length(response_text) <= 4000),
  response_ms         int check (response_ms >= 0),
  was_overdue         boolean not null default false,
  overdue_days        int not null default 0 check (overdue_days >= 0),
  ladder_step_before  smallint,
  ladder_step_after   smallint,
  interval_days       int,
  created_at          timestamptz not null default now(),
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);

create index review_logs_user_time_idx on public.review_logs (user_id, reviewed_at desc);
create index review_logs_card_idx on public.review_logs (card_id, reviewed_at desc);

-- ---------- productions (personal "usage bank") -----------------------

create table public.productions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid(),
  item_id         uuid not null,
  card_id         uuid references public.cards (id) on delete set null,
  client_id       uuid not null unique default gen_random_uuid(),
  mode            text not null check (mode in ('written', 'spoken')),
  exercise        text not null default 'sentence'
                    check (exercise in ('sentence', 'situation', 'shadowing', 'drill')),
  drill_id        uuid,             -- groups the 3–5 items of one free-speaking drill
  context         text,             -- work / travel / family / ielts_p1 / ...
  prompt          text,
  text            text not null check (length(btrim(text)) between 1 and 8000),
  passed          boolean not null default false,
  duration_ms     int check (duration_ms >= 0),
  ai_feedback     jsonb,
  corrected_text  text,
  created_at      timestamptz not null default now(),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);

create index productions_item_idx on public.productions (item_id, created_at desc);
create index productions_user_time_idx on public.productions (user_id, created_at desc);

-- ---------- settings (one row per user) -------------------------------

create table public.settings (
  user_id                uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  daily_new_limit        int not null default 15 check (daily_new_limit between 0 and 500),
  daily_review_limit     int not null default 150 check (daily_review_limit between 1 and 2000),
  ladder                 int[] not null default '{1,3,7,12,20,35,60,100}'
                           check (public.is_valid_ladder(ladder)),
  srs_mode               text not null default 'ladder' check (srs_mode in ('ladder', 'fsrs')),
  reminder_times         time[] not null default '{08:00,20:00}',
  direction_mode         text not null default 'random'
                           check (direction_mode in ('random', 'en_uz', 'uz_en', 'both')),
  tts_voice              text,
  tts_rate               numeric(3, 2) not null default 1.00 check (tts_rate between 0.5 and 2.0),
  timezone               text not null default 'Asia/Tashkent',
  overdue_penalty        boolean not null default true,
  -- how many top ladder steps are locked until written + spoken production passed
  production_gate_steps  smallint not null default 3 check (production_gate_steps >= 0),
  maintenance_days       int not null default 180 check (maintenance_days between 30 and 3650),
  theme                  text not null default 'system' check (theme in ('system', 'light', 'dark')),
  updated_at             timestamptz not null default now()
);

create trigger settings_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------- push subscriptions ----------------------------------------

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null,       -- { p256dh, auth }
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------- daily snapshots (calendar history) ------------------------
-- Written by pg_cron right after the user's midnight. Lets the calendar
-- show exact due / done / missed counts for past days.

create table public.daily_snapshots (
  user_id       uuid not null references auth.users (id) on delete cascade,
  day           date not null,
  due_count     int not null default 0,
  done_count    int not null default 0,
  missed_count  int not null default 0,
  reviews_count int not null default 0,
  created_at    timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------- view: cards + computed overdue_days -----------------------
-- overdue_days depends on "today", so it cannot be a stored/generated
-- column. New (never studied) and suspended cards are never "overdue".

create view public.cards_view
with (security_invoker = true)
as
select
  c.*,
  case
    when c.status in ('learning', 'review', 'mastered')
      then greatest(0, public.today_tz(coalesce(s.timezone, 'Asia/Tashkent')) - c.due_date)
    else 0
  end::int as overdue_days
from public.cards c
left join public.settings s on s.user_id = c.user_id;

-- ---------- new user bootstrap ----------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPC: put library items into repetition --------------------
-- Creates both direction cards (idempotent). Runs as the caller, so RLS applies.

create or replace function public.schedule_items(p_item_ids uuid[])
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted int;
  tz text;
begin
  select coalesce(s.timezone, 'Asia/Tashkent') into tz
  from public.settings s where s.user_id = auth.uid();

  insert into public.cards (user_id, item_id, direction, due_date)
  select i.user_id, i.id, d.direction, public.today_tz(coalesce(tz, 'Asia/Tashkent'))
  from public.items i
  cross join (values ('en_uz'), ('uz_en')) as d (direction)
  where i.id = any (p_item_ids)
    and i.user_id = auth.uid()
  on conflict (item_id, direction) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
