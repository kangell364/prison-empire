# Prison Skill Cards — "Jailhouse Affix" Spec

Status: **Phase 1 shipped (data only), Phase 2+ designed, not built.**

Skill cards equip into the Battle Dice slots (2–12). When a roll's two-dice **sum**
matches a slot you have a skill in, that skill fires for the round (existing
mechanic, `BattleDiceModal.resolve()`). Today a skill does exactly one thing — adds
attack (`perLevelAttack`). This spec layers a **give/take effect system** on top and
a **random-affix collection loop** around it.

The card is the **body**; the rolled skill is the **soul**. Separate them and
everything below falls out cleanly.

---

## 1. Card anatomy

Every skill card has two independent parts:

- **Base** — art + name + family + `perLevelAttack` (a fixed, always-aggressive
  nuke). Levels exactly like other cards: stack 20 → merge → next level, base
  damage grows per level. **A bad skill roll is never a worthless card** — the base
  nuke always works. This is the guardrail that makes fully-random fair.
- **Affixes** — the actual *skills* (Bleed, Loaded Dice, The Hole…), **rolled
  randomly** and attached to the card instance.

### Skills per card level (a roll happens at every skill slot)

| Card level | Skills | How |
|---|---|---|
| **Lvl 1** | **1 skill** | Rolled on acquisition (the first "bad-luck or jackpot" moment) |
| **Lvl 2** | **2 skills** | Merge 20 → keep 1st, **roll a surprise 2nd** |
| **Lvl 3** | **3 skills** | Merge → keep both, **roll a surprise 3rd** |
| **Lvl 4+** | still 3 (cap) | Further merges only grow base damage |

**Hard cap: 3 active affixes per card.** More than 3 stacked effects per side makes
the fight unreadable on a phone — that's the real failure mode, not the code. A
Lvl 3 card = 3 synergistic skills firing = the chase.

The gamble is live from the **very first Level 1 card** — you don't grind to unlock
it.

---

## 2. The 4 effect primitives (+ dice tier)

Every skill is built from these. Vocabulary stays small on purpose.

| Primitive | What it does | Examples |
|---|---|---|
| **Nuke** | Bonus/multiplied damage this roll (today's behavior) | Skull Crusher / Nightstick |
| **DOT** | Damage over the next N rolls | Shiv (bleed) |
| **Disable** | Mute opponent skill slots for N rolls | The Hole, Lights Out |
| **Modifier** | Timed atk/def/payout shift (`duration: 'fight'` or N rolls) | Shakedown, Contraband |
| **Dice** *(native)* | Steer the roll itself — nudge ±1, lock a die | Loaded Dice |

The **Dice** tier is the most native to this engine (our trigger *is* the dice sum)
and the most novel vs. other games — lean into it.

### Effect schema (lives on each `SKILLS` entry)

```js
effect: {
  kind:   'dot' | 'disable' | 'modifier' | 'dice',
  target: 'opponent' | 'self' | 'both',
  // dot ........ pctMaxHp, rolls
  // disable .... slots ('even'|'odd'|[2,12]), rolls
  // modifier ... stat ('atk'|'def'|'payout'), pct, duration ('fight'|<rolls>)
  // dice ....... nudge (±1), rolls
  selfCost:      { ...same shape, refundOnExpire?: true },  // holder's recoverable cost
  fizzleChance:  0..1,                                      // prison-made gear misfires
  scalePerLevel: { <field>: perLevel },                    // grows as the CARD levels (merge)
  slotBias:      <n> | [n,n],                               // which dice slot it wants
}
```

---

## 3. DESIGN LAW — lean to the holder

> **The holder's downside is conditional or recoverable; the opponent's downside is
> unconditional.** The skill always nets in favor of whoever slotted it.

If an effect can't be written that way, it's an **enemy debuff** (put it on bosses),
not a player skill. Examples already in the catalog:

- **The Hole** — *you* bleed but it's **refunded**; *they* lose slots flat.
- **Shakedown** — both lose def, but **you** convert yours into attack.
- **Contraband** — −atk *only while held*; the 2× payout is **banked on KO**.

The give/take is real (it's a gamble, fights swing), but it tilts to the owner.

---

## 4. The dice-slot rarity lever (free balance axis)

A two-dice sum is **not flat** — each slot fires at a different rate. Use slot
position to gate power; no separate combat-rarity system needed.

| Slot | 7 | 6/8 | 5/9 | 4/10 | 3/11 | **2/12** |
|---|---|---|---|---|---|---|
| Fires/roll | 16.7% | 13.9% | 11.1% | 8.3% | 5.6% | **2.8%** |

Devastating-but-costly skills bias to **2/12** (rare haymaker); small reliable buffs
bias near **7**. Encoded per skill as `slotBias`.

---

## 5. Randomness model (Phase 2)

**Fully random affixes on a fixed aggressive base.** Decided 2026-06-10.

- On acquisition, a Lvl 1 card rolls **1 skill** from the weighted pool.
- Each merge rolls **1 surprise skill** (up to the cap of 3).
- Rolls are **rarity-weighted** (see pool table) — not uniform.
- Safety valves make fully-random fair instead of feel-bad (see §7). Without them,
  fully random is a rip-off; with them it's the core gamble.

**Jackpot:** small chance a merge rolls a rare-tier affix or grants a bonus slot —
the "you got lucky" beat.

---

## 6. Skill pool — launch ~30, grow forever

Built **append-only** (like the Commissary commons pool auto-grows). Roll weights by
rarity:

| Rarity | Roll weight | Launch count | Flavor |
|---|---|---|---|
| Common | ~40% | ~10 | Small reliable — tiny nudge, minor bleed, +atk/+def trims |
| Uncommon | ~30% | ~8 | Shiv, Loaded Dice tier |
| Rare | ~20% | ~6 | The Hole, Shakedown tier |
| Epic | ~8% | ~4 | Big swings — reflect, stun |
| Legendary | ~2% | ~2–3 | Contraband, Razor Wire — build-defining |
| **Total** | | **~30** | |

Why ~30: with 3 slots and random rolls, ~30 keeps the equipped trio from feeling
same-y and gives real chase, while staying small enough that **every skill gets art
+ a tuned effect**. A too-large fully-random pool backfires — a wanted 1-in-80 skill
feels awful (this is where the re-roll token earns its keep). **Quality over count
at launch.**

### Retention: seasonal drops (the "keep them interested" engine)

Ship **~5–8 new skills per season/event drop**, append to the pool. Each drop:
- refreshes the roll pool → players gamble again to chase the new ones
- can debut **pack-exclusive / token-store** before entering the general pool

Costs only 5–8 arts+effects per drop, not a giant upfront pile.

**Bottleneck: art.** Ship Phase 2 with the **6 cards we have** wired and working,
then build toward 30 as art lands. Don't block the engine on a full pool.

---

## 7. The gamble loop — burn / re-roll / Hustle

Makes the **meta** give/take mirror the **combat** give/take.

1. A card rolls a skill you don't want.
2. **Choice:**
   - **Burn it** → **1 re-roll token + a Hustle refund**, or
   - **Keep it** → spend a re-roll token to try again, or stack toward a merge and
     hope the next roll saves it.
3. A bad roll is **never a dead loss** — that's what keeps fully-random fun.

### Burn payout

```
hustleRefund = BASE × cardLevel × (1 + playerLevel × k)
reRollToken  = 1   (flat, always)
```

- **cardLevel** — burning a Lvl 3 (3 sunk rolls) pays more than a Lvl 1.
- **playerLevel** — a Lvl 60's Hustle income dwarfs a Lvl 1's, so the refund tracks
  their economy. A flat refund rots fast; this keeps it meaningful at every level.
- Peg **`BASE`** to *what a fight pays at the player's level* (refund ≈ "a few
  fights' worth of Hustle") so it's always a real chunk, never stale.
- **Token stays flat** — its value is the re-roll itself. Flat keeps it clean as a
  **giveaway / pack filler** (a store/pack hook).

`k` and `BASE` are tuning knobs — set during Phase 2 balancing.

---

## 8. Phase 1 catalog (SHIPPED — data only)

In `src/data/gameData.js` → `SKILLS`. **Fixed** affixes (no random roll yet). The
combat engine does **not** read `effect` yet, so each works as a plain nuke until
Phase 2 — safe to ship.

| Card | Rarity | Primitive | Effect | Cost | slotBias |
|---|---|---|---|---|---|
| 💀 Skull Crusher | epic | Nuke | Big bonus damage | — | reliable |
| 🔪 Shiv | uncommon | DOT | Bleed 2% maxHP/roll × 3 | 20% snaps | 7 |
| 🕳️ The Hole | rare | Disable | Opp. even slots dark 3 rolls | you bleed — refunded | 3/11 |
| 🤜 Shakedown | rare | Modifier | Both −10% def; yours → atk (fight) | def loss lasts the fight | 4/10 |
| 🎲 Loaded Dice | uncommon | Dice | Nudge next 2 sums toward your slots | 15% die cracks | 6/8 |
| 📦 Contraband | legendary | Modifier | 2× payout if this slot KOs | −10% atk while held | 12 |

Art is a placeholder (all reuse `skill-skull-crusher.jpg`, `// TODO art`).

---

## 9. Build phases

- **Phase 1 — catalog (DONE).** 5 fixed-affix cards + schema in `SKILLS`. Inert
  `effect` metadata; cards act as nukes today.
- **Phase 2 — the engine.** Wire `effect` into `BattleDiceModal.resolve()`: the 4
  primitives + dice nudge, with on-screen status readouts. Tune numbers. Still
  fixed affixes — prove the give/take *feels* right with hand-tuned cards before
  adding randomness.
- **Phase 3 — the casino.** Random affix roll on acquire + merge-surprise; the
  burn / re-roll-token / scaled-Hustle loop; jackpot rolls. Needs an affix store
  (rolled affixes per card instance) + a re-roll token currency.
- **Phase 4 — content cadence.** Grow the pool toward 30; seasonal drops; pack /
  token-store exclusives.

---

## 10. Onboarding — free new-player skill pack

A **free skill-card pack** sits in the Shop; **every new player gets it once**.
Opening it grants **1 random skill card** from the pool (Lvl 1). Decided 2026-06-10.

Why it matters:
- First taste of the **gamble loop** on day one — they open something, get a random
  skill, and immediately face the keep/burn/re-roll choice.
- The **first real source** for skill cards (the system's long-standing "no
  duplicate source" gap — see §6 / memory). Not the *only* source — ongoing sources
  (boss drops, token store, seasonal packs) still needed.

Mechanics:
- **One-time grant** per account (guard flag, like a starter seed; not repeatable).
- Contents = **1 card**, rolled from the weighted pool (§6). In Phase 1 this is a
  random pick from the 6 fixed-affix `SKILLS`; once Phase 3 lands it's a full random
  affix roll.
- **Reuses the Commissary spin-open reveal** (`CommissaryPack.jsx` →
  `RevealedCard`), single-card variant — no new animation to build.
- Lives as a **Shop banner** (mirror the Commissary Pack banner pattern).

**Art:** the pack itself is being designed by the user (the skill-card pack art).
Engine work is small and reuses existing reveal scaffolding; it's gated on the art.

---

## 11. Stores touched

- `skillCardsStore` — stack/merge (exists)
- `skillUpgradesStore` — per-card upgrade stat (exists)
- `skillLoadoutStore` — dice-slot loadout (exists)
- **NEW (Phase 3):** affix store — the rolled affix instances per card; re-roll
  token balance; burn → refund logic.

Related memory: `project_skill_cards`, `project_card_system`, `project_commissary_pack`.
