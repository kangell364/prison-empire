// playersStore — directory of other players' public identity (name + look),
// read from the `public_profiles` view (safe columns only; no hustle/email).
// Used by the leaderboard + activity feed to turn owner ids into names.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'

let cache = {}            // id -> { display_name, player_look_id }
let loaded = false
let pending = null
const listeners = new Set()

export async function loadPlayers() {
  if (!isSupabaseConfigured) return cache
  if (pending) return pending
  pending = (async () => {
    const { data } = await supabase.from('public_profiles').select('*')
    if (data) { const next = {}; data.forEach(p => { next[p.id] = p }); cache = next; loaded = true; listeners.forEach(f => f(cache)) }
    pending = null
    return cache
  })()
  return pending
}

export function playerName(id) { return (id && cache[id]?.display_name) || 'Player' }

// Reactive directory. Loads once on first use; call refresh() when a new owner
// id shows up that we don't have a name for yet.
export function usePlayers() {
  const [v, setV] = useState(cache)
  useEffect(() => {
    listeners.add(setV)
    if (!loaded) loadPlayers()
    return () => listeners.delete(setV)
  }, [])
  return {
    players: v,
    name: (id) => (id && v[id]?.display_name) || 'Player',
    refresh: loadPlayers,
  }
}
