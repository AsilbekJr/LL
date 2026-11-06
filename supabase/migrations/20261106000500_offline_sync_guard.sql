-- =====================================================================
-- Offline sync: conflict-safe by timestamps.
-- Answers made offline are sent later, possibly after the same card was
-- already reviewed again on another device. A card update carrying an
-- OLDER last_reviewed_at than the stored one is skipped (the review log
-- is still kept), so newer progress is never overwritten.
-- Updates that do not touch last_reviewed_at (suspend, encounter, sibling
-- mastery) or reset it to null (reset progress) are unaffected.
-- =====================================================================

create or replace function public.cards_skip_stale_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.last_reviewed_at is not null
     and new.last_reviewed_at is not null
     and new.last_reviewed_at < old.last_reviewed_at then
    return null; -- skip this row
  end if;
  return new;
end;
$$;

create trigger cards_skip_stale_update
  before update on public.cards
  for each row execute function public.cards_skip_stale_update();
