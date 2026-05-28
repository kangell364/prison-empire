-- Phase 2 (revised): stacking + merging card collection.
--
-- Supersedes 0002_owned_cards.sql. The owned-yes-no model couldn't express
-- "I have 17 Big Ts" or "this is my Level 2 Big T". This migration drops
-- the old table and replaces it with a counts-and-levels model:
--
--   - One row per (user, card_id, card_level).
--   - `count` is total cards held at that level. UI breaks it into
--     20-card "stacks" cosmetically — 47 cards = 2 full stacks + 7.
--   - Merging a level consumes 20 cards from `count`, inserts/increments
--     a row at card_level+1.
--   - Levels are unbounded — merge as deep as you can stack.

drop table if exists public.owned_cards;

create table if not exists public.card_collection (
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  card_id     integer     not null,
  card_level  integer     not null default 1 check (card_level >= 1),
  count       integer     not null default 1 check (count >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, card_id, card_level)
);

alter table public.card_collection enable row level security;

create policy "card_collection_self_select"
  on public.card_collection for select
  using (auth.uid() = user_id);

create policy "card_collection_self_insert"
  on public.card_collection for insert
  with check (auth.uid() = user_id);

create policy "card_collection_self_update"
  on public.card_collection for update
  using (auth.uid() = user_id);

create policy "card_collection_self_delete"
  on public.card_collection for delete
  using (auth.uid() = user_id);

-- Touch updated_at on every change so the client can show "last synced".
drop trigger if exists card_collection_touch_updated_at on public.card_collection;
create trigger card_collection_touch_updated_at
  before update on public.card_collection
  for each row execute function public.touch_updated_at();

-- Replace the signup trigger to seed starter cards at count=1 each,
-- card_level=1. Keep the id list in sync with STARTER_CARD_IDS in
-- src/data/gameData.js.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.card_collection (user_id, card_id, card_level, count)
    values
      (new.id, 1, 1, 1), (new.id, 2, 1, 1), (new.id, 3, 1, 1),
      (new.id, 4, 1, 1), (new.id, 5, 1, 1), (new.id, 6, 1, 1);
  return new;
end;
$$;

-- Backfill: every existing profile gets the starter cards at count=1.
-- Idempotent via on conflict do nothing.
insert into public.card_collection (user_id, card_id, card_level, count)
select p.id, sc.card_id, 1, 1
from public.profiles p
cross join (values (1),(2),(3),(4),(5),(6)) as sc(card_id)
on conflict do nothing;
