-- Phase 2: owned_cards table.
-- One row per (user, card) the user owns. Pack opens insert rows.
-- The static CARDS_COLLECTION in gameData.js is now catalog-only —
-- ownership is the union of starter cards (seeded on signup) and
-- whatever a player has unlocked via pack reveals.

create table if not exists public.owned_cards (
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  card_id     integer     not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

alter table public.owned_cards enable row level security;

create policy "owned_cards_self_select"
  on public.owned_cards for select
  using (auth.uid() = user_id);

create policy "owned_cards_self_insert"
  on public.owned_cards for insert
  with check (auth.uid() = user_id);

create policy "owned_cards_self_delete"
  on public.owned_cards for delete
  using (auth.uid() = user_id);

-- Extend the signup trigger so every new anon user gets the 6 starter
-- cards at the same moment their profile row appears. Keep this list
-- in sync with STARTER_CARD_IDS in src/data/gameData.js.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.owned_cards (user_id, card_id)
    values
      (new.id, 1), (new.id, 2), (new.id, 3),
      (new.id, 4), (new.id, 5), (new.id, 6);
  return new;
end;
$$;

-- Backfill: any profile that existed before this migration (Phase 1
-- users — basically just the dev/test account) gets the starter cards
-- too. on conflict do nothing makes this idempotent.
insert into public.owned_cards (user_id, card_id)
select p.id, sc.card_id
from public.profiles p
cross join (values (1),(2),(3),(4),(5),(6)) as sc(card_id)
on conflict do nothing;
