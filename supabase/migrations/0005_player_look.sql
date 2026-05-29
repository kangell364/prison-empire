-- Persist the player's chosen cosmetic "look" card.
--
-- player_look_id references an id in PLAYER_LOOKS (src/data/gameData.js).
-- Looks are purely cosmetic (no stats), curated by an admin, and never earned
-- in-game. Stored on the profile alongside display_name so it follows the
-- player across devices. Defaults to the first look.

alter table public.profiles
  add column if not exists player_look_id text not null default 'look_1';
