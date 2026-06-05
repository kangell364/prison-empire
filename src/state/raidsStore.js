// raidsStore — real PvP raids on the shared map.
//
// A raid is a TIMED attack on another player's trap house (the Supabase
// `houses` row). Launching inserts a `raids` row with an ends_at 15 min out;
// the defender sees it stream in live (reinforce window). At landing, either
// participant's client calls the resolve_raid() RPC, which applies damage
// server-side and — on a knockover — STEALS a cut of the defender's Hustle
// for the attacker (see public/multiplayer_raids.txt).
//
// Damage + the steal are server-authoritative (RLS + SECURITY DEFINER), so a
// client can't fake an outcome. Steel cost + reinforce are still client-trusted
// for now (consistent with the rest of the economy until the M3 anti-cheat pass).

import { useEffect, useState, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'
import { getUserId, spendSteel, addSteel } from './profileStore'

const COUNTY_FIPS = '48201'                       // Harris (MVP single county)

export const RAID_STEEL_COST  = 200               // cost to send a raid
export const REINFORCE_COST   = 120               // Steel to patch your own house
export const REINFORCE_AMOUNT = 30                // HP restored per reinforce

// Shorter timer in test mode (?test=1) so the en-route flow is quick to verify.
const TEST = typeof window !== 'undefined' && /(?:\?|&)test=1/.test(window.location.search)
export const RAID_DURATION_MS = TEST ? 30_000 : 15 * 60_000

// Damage scales with the attacker's combat power, clamped so no single raid is
// trivial or instantly fatal to a full house.
export function raidDamageFor(power) {
  return Math.max(15, Math.min(80, Math.round((power || 0) * 0.4)))
}

// Launch a raid. Spends Steel up front (refunded if the insert fails) and
// returns { ok, raid? , error? }.
export async function launchRaid({ targetHouse, power }) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Raids need an account connection.' }
  const uid = getUserId()
  if (!uid) return { ok: false, error: 'no-auth' }
  if (!targetHouse || !targetHouse.id) return { ok: false, error: 'no-target' }
  if (targetHouse.owner_id === uid) return { ok: false, error: 'self' }
  if (!spendSteel(RAID_STEEL_COST)) return { ok: false, error: 'broke' }

  const ends_at = new Date(Date.now() + RAID_DURATION_MS).toISOString()
  const { data, error } = await supabase.from('raids').insert({
    defender_id:     targetHouse.owner_id,
    target_house_id: targetHouse.id,
    county_fips:     targetHouse.county_fips || COUNTY_FIPS,
    damage:          raidDamageFor(power),
    ends_at,
  }).select().single()

  if (error) {
    addSteel(RAID_STEEL_COST)                     // refund — the raid never launched
    return { ok: false, error: error.message }
  }
  return { ok: true, raid: data }
}

// Ask the server to resolve a landed raid. Idempotent; returns the outcome json.
export async function resolveRaid(id) {
  const { data, error } = await supabase.rpc('resolve_raid', { p_raid_id: id })
  if (error) return { error: error.message }
  return data
}

// Reinforce YOUR OWN house — spend Steel, bump hp (RLS lets the owner update
// their own row directly, so no RPC needed). `house` is your houses row.
export async function reinforceMyHouse(house) {
  if (!isSupabaseConfigured || !house) return { ok: false, error: 'offline' }
  const max = house.hp_max != null ? house.hp_max : 100
  const cur = house.hp != null ? house.hp : max
  if (cur >= max) return { ok: false, error: 'full' }
  if (!spendSteel(REINFORCE_COST)) return { ok: false, error: 'broke' }
  const next = Math.min(max, cur + REINFORCE_AMOUNT)
  const { error } = await supabase.from('houses')
    .update({ hp: next, updated_at: new Date().toISOString() }).eq('id', house.id)
  if (error) { addSteel(REINFORCE_COST); return { ok: false, error: error.message } }
  return { ok: true, hp: next }
}

// Live unresolved raids I'm part of, split into incoming (I'm the defender) and
// outgoing (I'm the attacker). Re-fetches on any raids change touching me.
export function useActiveRaids() {
  const [raids, setRaids] = useState({ incoming: [], outgoing: [] })
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const uid = getUserId()
    if (!uid) return
    let alive = true
    const load = async () => {
      const { data } = await supabase.from('raids').select('*').eq('resolved', false)
      if (!alive || !data) return
      setRaids({
        incoming: data.filter(r => r.defender_id === uid),
        outgoing: data.filter(r => r.attacker_id === uid),
      })
    }
    load()
    const ch = supabase.channel(`raids:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raids', filter: `defender_id=eq.${uid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'raids', filter: `attacker_id=eq.${uid}` }, load)
      .subscribe()
    return () => { alive = false; try { supabase.removeChannel(ch) } catch {} }
  }, [])
  return raids
}

// Watches the active raids and, when one passes its ends_at, fires resolve_raid
// exactly once, then hands the outcome to onResolved(raid, result). Both the
// attacker's and defender's clients run this; resolve_raid is idempotent so a
// double-call is harmless (the second gets replay:true and is ignored here).
export function useRaidResolver(active, onResolved) {
  const attempted = useRef(new Set())
  const cbRef = useRef(onResolved)
  cbRef.current = onResolved
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const all = [...(active.incoming || []), ...(active.outgoing || [])]
    const tick = async () => {
      const now = Date.now()
      for (const r of all) {
        if (attempted.current.has(r.id)) continue
        if (new Date(r.ends_at).getTime() > now) continue
        attempted.current.add(r.id)
        const result = await resolveRaid(r.id)
        if (result && !result.error && !result.replay) {
          cbRef.current && cbRef.current(r, result)
        }
      }
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [active])
}
