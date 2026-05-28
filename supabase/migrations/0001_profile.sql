-- Phase 1: profiles table.
-- One row per auth user. Holds the resource balances + display name.
-- Other player fields (level, XP, traits, pools, skills) stay in static
-- gameData.js for now — they get their own migration when those systems
-- become real (skills phase, level/XP phase).

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text        not null default 'SlickRico',
  hustle          integer     not null default 7420,
  steel           integer     not null default 3210,
  cred            integer     not null default 0,
  snitches_left   integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- RLS: a user can only see and mutate their own profile row.
create policy "profiles_self_select"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_self_insert"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up
-- (including anonymous sign-ins). This is what makes Phase 0 + Phase 1
-- a single seamless onboarding — no client-side "is there a profile yet?"
-- check required.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on every change so the client can show "last synced".
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
