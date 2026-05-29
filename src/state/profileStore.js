// Profile store — the player's persisted state.
//
// Two backends:
//   - Supabase (when REACT_APP_SUPABASE_URL is set): row in public.profiles
//     keyed by anon-auth user id. Mutations are optimistic locally, async
//     pushed to the server, and echoed back via realtime.
//   - localStorage fallback: single JSON blob at pe_profile_v1. Used when
//     env vars are missing — keeps the app working in CI / preview / before
//     the user creates a Supabase project.
//
// Phase 1 scope: hustle, steel, cred, snitches_left, display_name. Other
// PLAYER fields (level, XP, traits, pools, skills) still come from static
// gameData — they get their own phases.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'
import { RESOURCES, PLAYER, DEFAULT_LOOK_ID } from '../data/gameData'

const PROFILE_KEY        = 'pe_profile_v1'
const LEGACY_HUSTLE_KEY  = 'pe_hustle_v1'
const MIGRATED_FLAG_KEY  = 'pe_migrated_v1'

const DEFAULTS = {
  display_name:   PLAYER.name,
  hustle:         RESOURCES.hustle.value,
  steel:          RESOURCES.steel.value,
  cred:           0,
  snitches_left:  RESOURCES.snitch.value,
  player_look_id: DEFAULT_LOOK_ID,
}

let state = readLocalSeed()
let userId = null
let initPromise = null
const listeners = new Set()

// ---- public API ----------------------------------------------------

export function getProfile()      { return state }
export function getHustle()       { return state.hustle }
export function getSteel()        { return state.steel }
export function getDisplayName()  { return state.display_name }
export function getUserId()       { return userId }

export function useProfile() {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    return () => listeners.delete(setS)
  }, [])
  return s
}

export function useHustle()       { return useProfile().hustle }
export function useSteel()        { return useProfile().steel }
export function useDisplayName()  { return useProfile().display_name }

export function setHustle(v) {
  v = Math.max(0, Math.floor(v))
  commit({ hustle: v })
}
export function addHustle(delta) { setHustle(state.hustle + delta) }

// Synchronous check against the local cache — returns false if the player
// can't afford it. Caller is responsible for not applying the corresponding
// game effect on a false return.
export function spendHustle(cost) {
  if (cost > state.hustle) return false
  setHustle(state.hustle - cost)
  return true
}

export function setSteel(v) {
  v = Math.max(0, Math.floor(v))
  commit({ steel: v })
}
export function addSteel(delta) { setSteel(state.steel + delta) }

export function spendSteel(cost) {
  if (cost > state.steel) return false
  setSteel(state.steel - cost)
  return true
}

export function setDisplayName(name) {
  if (typeof name !== 'string' || !name.trim()) return
  commit({ display_name: name.trim() })
}

export function getPlayerLookId()  { return state.player_look_id }
export function usePlayerLook()    { return useProfile().player_look_id }
export function setPlayerLook(id) {
  if (typeof id !== 'string' || !id) return
  commit({ player_look_id: id })
}

// Called from App.js on mount. Safe to call repeatedly — returns the same
// promise. When Supabase isn't configured this is a no-op resolved promise.
export function ensureAuth() {
  if (initPromise) return initPromise
  initPromise = isSupabaseConfigured ? bootSupabase() : Promise.resolve()
  return initPromise
}

// ---- internals -----------------------------------------------------

function commit(patch) {
  state = { ...state, ...patch }
  persistLocal()
  notify()
  if (isSupabaseConfigured && userId) {
    pushToSupabase(patch).catch(err => {
      console.warn('[profileStore] push failed', err)
    })
  }
}

function notify() { listeners.forEach(fn => fn(state)) }

function persistLocal() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(state)) } catch {}
}

function readLocalSeed() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULTS, ...parsed }
    }
  } catch {}
  return { ...DEFAULTS }
}

async function bootSupabase() {
  // Get or create an anonymous session.
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      console.warn('[profileStore] anon sign-in failed, staying local', error)
      return
    }
  }
  const { data: userData } = await supabase.auth.getUser()
  userId = userData.user?.id
  if (!userId) return

  // Fetch the row (created by handle_new_user trigger). On the very first
  // sign-in there can be a brief window before the trigger fires; retry once.
  let row = await fetchProfile()
  if (!row) {
    await new Promise(r => setTimeout(r, 400))
    row = await fetchProfile()
  }
  if (!row) {
    console.warn('[profileStore] no profile row found — staying local')
    return
  }

  // First-sign-in migration: if the row is fresh AND we have legacy
  // localStorage keys, push them up and clear them. Only runs once.
  const isFreshRow   = (Date.now() - new Date(row.created_at).getTime()) < 60_000
  const alreadyMigrated = localStorage.getItem(MIGRATED_FLAG_KEY) === '1'
  if (isFreshRow && !alreadyMigrated) {
    const migrated = await migrateFromLocal(row)
    if (migrated) row = { ...row, ...migrated }
    try { localStorage.setItem(MIGRATED_FLAG_KEY, '1') } catch {}
  }

  // Adopt server state as authoritative (overrides the localStorage seed
  // we used at module load).
  state = { ...DEFAULTS, ...row }
  persistLocal()
  notify()

  // Realtime: keep the local cache in sync with any other tabs / devices.
  supabase
    .channel(`profile:${userId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'profiles',
      filter: `id=eq.${userId}`,
    }, payload => {
      state = { ...state, ...payload.new }
      persistLocal()
      notify()
    })
    .subscribe()
}

async function fetchProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    console.warn('[profileStore] fetch failed', error)
    return null
  }
  return data
}

async function pushToSupabase(patch) {
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId)
  if (error) throw error
}

// Returns the patch that was applied (or null if nothing migrated).
async function migrateFromLocal(serverRow) {
  const patch = {}
  try {
    const rawHustle = localStorage.getItem(LEGACY_HUSTLE_KEY)
    if (rawHustle != null) {
      const n = parseInt(rawHustle, 10)
      if (Number.isFinite(n) && n !== serverRow.hustle) {
        patch.hustle = n
      }
    }
  } catch {}
  if (Object.keys(patch).length === 0) return null
  await pushToSupabase(patch)
  try { localStorage.removeItem(LEGACY_HUSTLE_KEY) } catch {}
  return patch
}
