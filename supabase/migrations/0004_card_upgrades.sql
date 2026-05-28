-- Phase 3 (partial): per-card ATK/DEF upgrade levels.
--
-- Upgrades used to live inside crewStore's pe_crew_v1 localStorage blob,
-- keyed by card_id only (implicitly Level 1). This table moves them to the
-- cloud AND makes them level-aware: a Big T Lvl 1 with +5 ATK no longer
-- shares that boost with a Big T Lvl 2.
--
--   - One row per (user, card_id, card_level).
--   - `atk` / `def` are upgrade LEVELS (0..20), not stat bonuses. The bonus
--     is level × ATK_PER_LEVEL on the client (see src/state/crewStore.js).
--   - No seed: new players start with zero upgrades. The client migrates any
--     legacy localStorage upgrades up on first sign-in.

create table if not exists public.card_upgrades (
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  card_id     integer     not null,
  card_level  integer     not null default 1 check (card_level >= 1),
  atk         integer     not null default 0 check (atk >= 0),
  def         integer     not null default 0 check (def >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, card_id, card_level)
);

alter table public.card_upgrades enable row level security;

create policy "card_upgrades_self_select"
  on public.card_upgrades for select
  using (auth.uid() = user_id);

create policy "card_upgrades_self_insert"
  on public.card_upgrades for insert
  with check (auth.uid() = user_id);

create policy "card_upgrades_self_update"
  on public.card_upgrades for update
  using (auth.uid() = user_id);

create policy "card_upgrades_self_delete"
  on public.card_upgrades for delete
  using (auth.uid() = user_id);

-- Touch updated_at on every change so the client can show "last synced".
drop trigger if exists card_upgrades_touch_updated_at on public.card_upgrades;
create trigger card_upgrades_touch_updated_at
  before update on public.card_upgrades
  for each row execute function public.touch_updated_at();
