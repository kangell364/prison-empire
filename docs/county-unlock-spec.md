# County Unlock — Demand/Supply Spec

Status: **design, not built.** Targets the Supabase/multiplayer phase (login required).
NPC blocks stay as-is — every county is pre-seeded with procedural rival crews, so a
freshly-unlocked county is immediately playable solo.

## Problem

The map is ~3,231 real counties; a single player can only own `25 × level` blocks
(250 at level 10). Left unbounded, players scatter 1-per-30-counties — a ghost town.
We want the playable world to **grow to match the live population** so every open
county is dense and contested.

## Core mechanic — PER STATE

Every **state** seeds one county at launch (the whole USA map is alive on day one) and then
runs its **own** demand-vs-supply ratio. This is intentionally NOT a single global ratio: a
50-county seed would make global supply so large that a small player base never crosses the
threshold, freezing all further unlocks. Per-state keeps density regional and GPS-driven.

For each state:
- **Demand** `D_state = Σ (25 × level)` over players **assigned to that state** (by GPS / real
  location). Level-aware for free: leveling raises demand.
- **Supply** `S_state = Σ (block_count of that state's unlocked counties)`. A county's
  block_count = number of `0.004°` grid cells whose center falls inside its polygon
  (e.g. Harris ≈ 26,870).
- **Unlock rule:** when `D_state ≥ TRIGGER × S_state`, unlock that state's next county
  (by `unlock_rank` within the state). `TRIGGER = 2.0` (200%) to start.
- **Never re-lock.** Unlock is one-way; churn must not orphan turf.

**Trade-off (accepted):** spreading across all states early means most states start with ~0
real players — just the procedural NPC crews. That's fine: NPC blocks keep every county
**solo-playable (PvE)**, so a lone player anywhere has turf to take; real PvP concentrates
where players actually cluster (cities/coasts). We trade "one dense arena" for "alive
everywhere, dense where the people are" — the right call given GPS/real-location is core.

### Why 2.0

Demand uses each account's *max cap*, but real ownership is a fraction of cap (blocks
cost Hustle + time). So "200% demand" ≈ a county that's maybe ~60% actually claimed —
dense but not capped out. The 2× buffer absorbs **both** the cap-vs-owned gap **and**
churn (accounts that sign up then go idle still inflate `D`). 150% unlocks too eagerly
and thins counties; higher than 2.0 makes blocks feel scarce/cutthroat. `TRIGGER` is a
server-side dial — tune from telemetry once the real cap-vs-owned ratio is known.

### Worked example (within one state)

- Texas seeds Harris (S_TX = 26,870). Texas opens its 2nd county at `D_TX ≥ 53,740`.
- At avg level 10 (cap 250) → ~**215 Texas players** before TX expands. Dense.
- Those same Texans climbing to level 20 (cap 500) → `D_TX` = 50,000 → nearly at unlock.
  Leveling alone drives a state's expansion.
- Meanwhile Montana, with 3 players, stays on its single seeded county — alive (NPC turf),
  just not crowded.

## Clustered turf (block structure within a county)

Keep the existing `0.004°` cell grid, but have NPCs own **clusters** of cells, not single
cells. This makes a fresh county fast to fill (chunky grabs) and lets it deepen as it
saturates — converging on today's per-cell grid.

- **An NPC controls a cluster of cells.** Taking the NPC flips the whole cluster to you in one
  move. Cluster grain depends on the county's **local fill %** (see ladder).
- **Income rides on the node, not the cells.** One NPC = one income node (pays for one
  block's worth), even though it controls a cluster of cells. So *territory* is grabbed in
  big chunks (the satisfying fill) while *income* comes from nodes — and subdivision is how
  income density grows: 1 node / 16 cells (sparse) → many nodes / 16 cells (rich). Avoids the
  "16× income for one cost" windfall and ties earnings to map maturity + competition.
- **Subdivision schedule (grain = f(local fill %)).** As a county fills, its remaining NPC
  territory fractures into smaller, more contested nodes:

  | County fill | NPC cluster | cells/NPC |
  |---|---|---|
  | 0–25%   | 4×4 | 16 |
  | 25–50%  | 3×4 | 12 |
  | 50–75%  | 3×3 | 9  |
  | 75–90%  | 2×3 | 6  |
  | 90–~98% | 2×2 | 4  |
  | ~98%+   | 1×1 | 1  |

- **Direction matters:** grain tracks **saturation**, NOT unlock rank. So *fresh* counties stay
  chunky (easy — good for the new players who keep arriving via GPS) and *old, full* cities
  become fine-grained (the deep veteran endgame). This is emergent — one rule for all 3,231
  counties, no per-county hand-tuning — and it points the right way (the frontier is the soft
  start, not the hardest place).
- **Only NPC clusters subdivide.** Player-owned turf is never carved up.
- **The player cap** (`25 × level`) counts **cells/nodes**, not clusters, so chunk size doesn't
  accidentally 16× anyone's holdings.

### Full map open at launch

Because every state's **seed county is fresh (0% filled), it starts at the 4×4 grain** — big,
visible, takeable NPC turf. Combined with the per-state seed (one county live per state on day
one), the **entire USA map reads as open and active from launch**, with chunky turf to grab in
every state, even before many real players arrive (NPC clusters carry the PvE).

## Supabase schema

```sql
-- accounts exist as `profiles`; need level + assigned state for per-state demand
-- profiles(id, ..., level int, state_fips text)   -- state_fips set at signup (GPS / choice)

-- catalog of every county, with precomputed capacity and within-state open order
create table county (
  fips        text primary key,         -- 5-digit county FIPS
  name        text not null,
  state_fips  text not null,
  block_count int  not null,            -- grid cells inside the polygon (precomputed)
  unlock_rank int  not null,            -- order WITHIN its state: 1 = the state's seed county
  unlocked_at timestamptz               -- null = locked; set once, never cleared
);

-- single-row config so TRIGGER is tunable without a deploy
create table world_config (
  id      int primary key default 1,
  trigger numeric not null default 2.0
);
```

`block_count` is computed once (offline) with the same point-in-polygon used by
`countyForPoint` in `src/state/mapData.js`, over the `0.004°` grid.

`unlock_rank` is the **within-state curated order**. Each state's `unlock_rank = 1` county
starts unlocked (the day-one seed → all 50 states live). Subsequent ranks open as that
state's demand grows.

## Unlock job (server-side, per state)

Run on a cron (every few minutes) or after signup/level-up events. For every state, unlock
its next-ranked locked county while that state's demand clears the threshold:

```sql
with cfg as (select trigger from world_config where id = 1),
     -- per-state demand from players assigned to the state
     d as (select state_fips, coalesce(sum(25 * level), 0) as demand
             from profiles group by state_fips),
     -- per-state supply from that state's unlocked counties
     s as (select state_fips, coalesce(sum(block_count), 0) as supply
             from county where unlocked_at is not null group by state_fips)
update county c
   set unlocked_at = now()
 where c.unlocked_at is null
   and c.unlock_rank = (select min(unlock_rank) from county
                          where unlocked_at is null and state_fips = c.state_fips)
   and coalesce((select demand from d where d.state_fips = c.state_fips), 0)
       >= (select trigger from cfg)
        * coalesce((select supply from s where s.state_fips = c.state_fips), 0);
```

Loop/repeat until no state still qualifies (a big jump in a state's demand may open more
than one county there). Seeding: set `unlocked_at = now()` on every `unlock_rank = 1` row.

## Per-state seed + within-state order

- **Seed (rank 1 per state):** pick a flagship/representative county per state — typically
  the state's largest metro (Harris/TX, Cook/IL, Maricopa/AZ, King/WA, …). 50 live counties
  at launch.
- **Within-state ranks 2+:** the next-biggest metros in that state, then fill outward. Keep
  the list server-side and editable; optionally bias by where that state's signups cluster.

## Signup → county assignment

On account creation, set `profiles.state_fips` from the player's **real GPS state** (or a
chosen state), and drop them into the **least-full unlocked county in that state** (lowest
`owned-blocks / block_count`). This makes density regional and ties play to real location.
If GPS is unavailable, fall back to a chosen state or the globally least-full county.

## Client / map state

- `useUnlockedCounties()` (or include in the existing map data load) → set of unlocked FIPS.
- **Country/state map:** locked counties render greyed/hatched; tapping shows
  "Unlocks at N players" (or "… as the world grows"). Only unlocked counties open the
  Turf Map.
- The block-by-county lists (`MapScreen`) already key off owned blocks; no change needed,
  but the turf map for a locked county should be blocked with the unlock hint.

## Open decisions

- **`TRIGGER` value** (2.0 to start; data-tune).
- **Active-only demand?** Counting all accounts at 2.0 over-provisions for churn (simple).
  Alternative: count only last-30-day-active players and lower `TRIGGER` (more responsive,
  but can stall expansion). Start with all-accounts × 2.0.
- **Multi-unlock per tick** vs one-at-a-time (loop recommended).
- **GPS weighting** of `unlock_rank` (nice-to-have, phase 2 of this feature).

## Touch points in the current codebase

- `src/state/mapData.js` — `countyForPoint`, county GeoJSON (block_count precompute reuses this).
- `src/state/blocksStore.js` — `blockCap()` = `25 × level`; per-county block math.
- `src/screens/MapScreen.jsx` — county/state map rendering + the blocks-by-county lists.
- Supabase: `profiles` (player count + level), new `county` + `world_config` tables.
