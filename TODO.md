# Prison Empire — To-Do

## Commissary pull system (gacha) — card source + currency sink
**Why:** Closes the front half of the collection loop. Card/skill/plant merging
already works, but there is no way to *earn* new cards (skills have no source at
all). A pull system gives merging a purpose, soaks up surplus Hustle/Cash, and
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
- Spend a currency to pull (Hustle/Cash for standard; a premium tier later for
  "watch ad / pay").
- Rarity-weighted odds (common → epic/legendary), surfaced to the player.
- Pulled cards write into the relevant collection store at Lvl 1, ready to stack
  and merge via the existing merge path.
- Decide pull pools: player/crew cards, skill cards, plant strains — possibly
  separate packs per pool.
- Pair with **daily login rewards + daily quests** (separate item) for retention.

**Status:** PARTIAL (2026-06-07). Shipped the free-pack slice: a **Commissary
Pack** (art: `public/pack-front.webp` / `pack-back.webp`) free every 24h, with a
live countdown + auto-deposit into a stash, an inventory grid under Cards / the
Store, and a black-screen spin-open (pack flips front↔back, accelerating →
bursts → reveals 5 cards). This is a **common crew pack**: 5 fully-random pulls
from `CARDS_COLLECTION.filter(rarity === 'common')` (auto-grows as commons are
added), landing in `cardsStore`. State in `src/state/packsStore.js`; whole flow
in `src/components/CommissaryPack.jsx`.
Still open: **currency-cost pulls** (Hustle/Cash sink), **rarity-weighted odds**
(uncommon→legendary) with odds surfaced, **skill + plant pack pools**, and a
premium tier.

---

## Backlog (from design review)
- Wire the Trap House jars into the real bank (currently fully isolated — quick win).
- Seasonal PvP ladder with rewards (forcing function for PvP).
- Ship territory / gang war (currently a stub; biggest "Empire" payoff).
- Prestige / rebirth for endgame multipliers.
- Daily login rewards DONE (2026-06-07): 7-day streak on Home (auto-pop
  calendar; Days 1-6 scaling Hustle, Day 7 = Commissary Pack; reset on miss).
  `dailyBonusStore` + `DailyBonus.jsx`. STILL OPEN: daily quest list.

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
