-- Speaking stage 1: pattern drills and Uzbek -> English spoken translation.
alter table public.productions drop constraint productions_exercise_check;
alter table public.productions
  add constraint productions_exercise_check
  check (exercise in ('sentence', 'situation', 'shadowing', 'drill', 'pattern', 'translation'));

-- "Active vocabulary" reads passed spoken uses per item.
create index if not exists productions_spoken_passed_idx
  on public.productions (user_id, item_id, created_at)
  where passed and mode = 'spoken';
