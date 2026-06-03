# Prison Empire — To-Do

## Commissary pull system (gacha) — card source + currency sink
**Why:** Closes the front half of the collection loop. Card/skill/plant merging
already works, but there is no way to *earn* new cards (skills have no source at
all). A pull system gives merging a purpose, soaks up surplus Hustle/Steel, and
adds the most popular mobile-RPG retention mechanic.

**Loop to build:** grind → earn currency → pull a pack → card lands in collection
→ stack to 20 → merge to next level → stronger crew → grind harder.

**Scope / notes:**
- A **pack-opening animation already exists** (shipped 2026-05-27): a pack
  delivers 3 cards, guaranteed 1 Uncommon+, tap-to-reveal each, summary grid at
  the end. Reuse it — the remaining work is the *front end* (a currency-cost pull
  entry point) and the *back end* (pulled cards actually landing in the
  collection stores), not the reveal sequence.
- Reuse existing scaffolding: `src/components/CommissaryPack.jsx`,
  `src/components/StoreModal.jsx`, and the card stores (`cardsStore`,
  `skillCardsStore`, `plantCardsStore`).
- Spend a currency to pull (Hustle/Steel for standard; a premium tier later for
  "watch ad / pay").
- Rarity-weighted odds (common → epic/legendary), surfaced to the player.
- Pulled cards write into the relevant collection store at Lvl 1, ready to stack
  and merge via the existing merge path.
- Decide pull pools: player/crew cards, skill cards, plant strains — possibly
  separate packs per pool.
- Pair with **daily login rewards + daily quests** (separate item) for retention.

**Status:** not started.

---

## Backlog (from design review)
- Wire the Trap House jars into the real bank (currently fully isolated — quick win).
- Seasonal PvP ladder with rewards (forcing function for PvP).
- Ship territory / gang war (currently a stub; biggest "Empire" payoff).
- Prestige / rebirth for endgame multipliers.
- Daily login rewards + daily quest list (retention; pairs with the pull system).

## Economy security (prerequisite for any player-to-player trading)
**The client cannot be trusted — app-store wrapping does NOT prevent duping.** The
packaged app is the same JS running on the player's device; saved state and memory
are editable (localStorage edits, GameGuardian, repackaging). Storing in Supabase
isn't enough either: if the *client* computes a value and writes it, a cheater
writes a bigger one.
- Single-player progression (own level/bank/grind): duping only cheats yourself —
  fine to leave client-side, don't over-invest.
- Anything shared (jar marketplace, PvP rewards, leaderboards, gang competition):
  MUST be server-authoritative. Server computes idle production from timestamps,
  validates trades via RPC/edge functions + RLS; client only requests.
- => Real P2P jar trading is a backend-trust problem, not a UI feature. Build the
  NPC market first (single-player, no exploit stakes); defer true P2P until the
  server owns the inventory.
