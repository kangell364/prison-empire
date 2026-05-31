import React from 'react'
import { BattleDiceModal } from './BattleDiceModal'
import { formatHustle } from './BountyModal'
import { PVP_FIGHT_COST } from '../data/gameData'
import { spendStamina, spendHealth } from '../state/vitalsStore'
import { addXp, creditRival, reclaimRival, getRivalXp } from '../state/progressionStore'
import { recordKoBy, recordKo, isRevengeTarget } from '../state/fightLogStore'
import { addHustle } from '../state/profileStore'
import { removeTarget } from '../state/hitListStore'

// PvP scoring constants (shared so the Players list previews match the fight).
export const XP_WIN      = 5
export const XP_LOSE     = 3      // a lost turn stings — and feeds the rival's bounty
export const RECLAIM_MULT = 3     // KO a rival → take back 3× what they banked off you
export const REVENGE_XP  = 50     // KO a rival who KO'd you → revenge bounty

// One PvP fight, wired for every entry point (Players tab, Hit List, Yard):
//   - each roll is an attack: out-damage them → +5 XP; they out-damage you → −3
//     XP handed to their bounty.
//   - KO them → reclaim 3× the XP they banked, +50 if it's a revenge target.
//   - if `bounty` is set (a hit-list contract), KO also pays out the Hustle pot
//     and removes them from the list.
export function PvpBattleModal({ opponent, bounty = 0, onKO, onClose }) {
  const reclaimPreview = getRivalXp(opponent.id) * RECLAIM_MULT
  const isRevenge = isRevengeTarget(opponent.id)

  const onAttack = ({ won, tie }) => {
    if (tie) return
    if (won) addXp(XP_WIN)
    else { addXp(-XP_LOSE); creditRival(opponent.id, XP_LOSE) }
  }

  const handleKO = (opp) => {
    const banked = reclaimRival(opp.id)
    if (banked) addXp(banked * RECLAIM_MULT)
    const { avenged } = recordKo(opp)
    if (avenged) addXp(REVENGE_XP)
    if (bounty) { addHustle(bounty); removeTarget(opp.id) }
    if (onKO) onKO(opp)
  }

  // Spend real health per hit (live), so the fight bar — which is now the
  // player's real Health pool — and the card stay one number. (Health was once
  // spent in a lump at resolve; that over-charged once the duel started from
  // current health instead of full.)
  const handleHit = ({ dealtToPlayer }) => spendHealth(dealtToPlayer)

  const handleResult = (r) => {
    if (r.result === 'lose') recordKoBy(opponent)
  }

  return (
    <BattleDiceModal
      opponent={opponent}
      cost={PVP_FIGHT_COST}
      attackXp={{ win: XP_WIN, lose: XP_LOSE }}
      rewards={{
        reclaim: reclaimPreview,
        revenge: isRevenge ? REVENGE_XP : 0,
        bountyText: bounty ? formatHustle(bounty) : undefined,
      }}
      onRoll={() => spendStamina(PVP_FIGHT_COST)}
      onAttack={onAttack}
      onHit={handleHit}
      onWin={handleKO}
      onResult={handleResult}
      onClose={onClose}
    />
  )
}
