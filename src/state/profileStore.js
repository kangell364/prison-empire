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
import { RESOURCES, PLAYER, PLAYER_LOOKS, DEFAULT_LOOK_ID } from '../data/gameData'
import { checkName } from './nameModeration'

// Random starter handle for a fresh account, so the shared map isn't a wall of
// identical 'SlickRico' defaults. e.g. "SlickRico47", "IronKane88".
const HANDLE_A = ['Iron', 'Yard', 'Block', 'Steel', 'Mad', 'Slick', 'Big', 'Ghost', 'King', 'Stone', 'Cold', 'Quick', 'Trap', 'Razor', 'Boss', 'Smoke', 'Diesel', 'Loc', 'Shotta', 'Grim', 'Lil', 'Young', 'Real', 'Top']
const HANDLE_B = ['Mike', 'Rico', 'Tony', 'Chino', 'Mack', 'Vince', 'Loco', 'Dre', 'Cisco', 'Capo', 'Reyes', 'Goon', 'Cash', 'Pesos', 'Don', 'Vato', 'Zilla', 'Trey', 'Wolf', 'Ace', 'Blaze', 'Kane', 'Fox', 'Snow']
function randomHandle() {
  const a = HANDLE_A[Math.floor(Math.random() * HANDLE_A.length)]
  const b = HANDLE_B[Math.floor(Math.random() * HANDLE_B.length)]
  return `${a}${b}${Math.floor(Math.random() * 900) + 10}`.slice(0, 20)
}

const PROFILE_KEY        = 'pe_profile_v1'
const HANDLE_FLAG_KEY    = 'pe_handle_assigned_v1'   // one-time random-handle assignment
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

// ---- auth state ----------------------------------------------------
// Every player has a Supabase session: anonymous by default, or a permanent
// email account once they "Save your account". `authEmail` is null while a guest.
let authEmail = null
let isAnon = true
let profileChannel = null            // active realtime channel (torn down on re-login)
const authListeners = new Set()
function notifyAuth() { const s = getAuth(); authListeners.forEach(fn => fn(s)) }

export function getAuth() {
  return { userId, email: authEmail, isAnonymous: isAnon, signedIn: !!authEmail, configured: isSupabaseConfigured }
}
export function useAuth() {
  const [s, setS] = useState(getAuth)
  useEffect(() => { authListeners.add(setS); setS(getAuth()); return () => authListeners.delete(setS) }, [])
  return s
}

// ---- password recovery ---------------------------------------------
// When a player opens the reset link from their email, Supabase parses the
// recovery token out of the URL and fires a PASSWORD_RECOVERY event. We surface
// that so the app can pop a "set a new password" screen (otherwise the link just
// signs them in with the OLD password still set, and they're stuck).
const recoveryListeners = new Set()
export function onPasswordRecovery(fn) { recoveryListeners.add(fn); return () => recoveryListeners.delete(fn) }
if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') recoveryListeners.forEach(fn => fn())
  })
}

// Set a new password for the signed-in (or recovery) session. Used by the reset
// flow after the email link, and could back an in-app "change password" later.
export async function updatePassword(newPassword) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Accounts are unavailable right now.' }
  if (!newPassword || newPassword.length < PASSWORD_MIN) return { ok: false, error: `Password must be at least ${PASSWORD_MIN} characters.` }
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { ok: false, error: friendlyAuthError(error) }
    await loadProfileForSession()          // adopt the now-permanent session + profile
    return { ok: true }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Try again.' }
  }
}

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

// The player's LIVE card identity (cosmetic look + name) — the ONE source every
// screen should use to show the player. Reflects SWAP + rename everywhere it's
// used. When adding any new view that shows the player, pull from here (not the
// static PLAYER.card / PLAYER.name) so it stays in sync. See the player-identity
// single-source memory note.
export function resolveLook(lookId) { return PLAYER_LOOKS.find(l => l.id === lookId) || PLAYER_LOOKS[0] }
export function usePlayerCard() {
  const p = useProfile()
  const look = resolveLook(p.player_look_id)
  return { name: p.display_name, avatar: look.avatar, emoji: look.emoji, rarity: look.rarity, lookId: look.id }
}

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

export const NAME_MAX_LEN = 20

export function setDisplayName(name) {
  if (typeof name !== 'string') return false
  // Hard cap at 20 characters — spaces count (slice is by code unit, so every
  // typed character including spaces counts toward the limit). Enforced here so
  // every entry point obeys it, not just the rename input's maxLength.
  const capped = name.slice(0, NAME_MAX_LEN)
  if (!capped.trim()) return false           // reject blank / whitespace-only
  // Profanity backstop — every entry point obeys the name filter, not just the
  // rename dialog (which also pre-checks so it can explain WHY before saving).
  if (!checkName(capped).ok) return false
  commit({ display_name: capped.trim() })
  return true
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

// ---- auth actions (email login) ------------------------------------
// All return { ok, error? } so the UI can show a friendly message.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PASSWORD_MIN = 8

function validateCredentials(email, password) {
  if (!EMAIL_RE.test(email || '')) return 'Enter a valid email address.'
  if (!password || password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`
  return null
}

// CREATE ACCOUNT — upgrades the current anonymous session into a permanent
// email account IN PLACE (same user id), so all progress is preserved. If the
// player is somehow not on an anon session, falls back to a fresh signUp.
export async function signUpWithEmail(email, password) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Accounts are unavailable right now.' }
  const bad = validateCredentials(email, password); if (bad) return { ok: false, error: bad }
  email = email.trim().toLowerCase()
  await ensureAuth()
  try {
    if (isAnon && userId) {
      // Convert the anonymous user → permanent (keeps the same id + all data).
      const { error } = await supabase.auth.updateUser({ email, password })
      if (error) return { ok: false, error: friendlyAuthError(error) }
      await loadProfileForSession()
      return { ok: true }
    }
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) return { ok: false, error: friendlyAuthError(error) }
    await loadProfileForSession()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Try again.' }
  }
}

// SIGN IN — load an existing account. WARNING for the caller: this replaces the
// current (possibly guest) session, so any unsynced local-only progress on this
// device is left behind in favor of the cloud account. The UI confirms first.
export async function signInWithEmail(email, password) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Accounts are unavailable right now.' }
  const bad = validateCredentials(email, password); if (bad) return { ok: false, error: bad }
  email = email.trim().toLowerCase()
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: friendlyAuthError(error) }
    initPromise = Promise.resolve()        // session already established
    await loadProfileForSession()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Try again.' }
  }
}

// FORGOT PASSWORD — emails a reset link back to the app.
export async function sendPasswordReset(email) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Accounts are unavailable right now.' }
  if (!EMAIL_RE.test(email || '')) return { ok: false, error: 'Enter a valid email address.' }
  const redirectTo = (typeof window !== 'undefined') ? `${window.location.origin}/` : undefined
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
  if (error) return { ok: false, error: friendlyAuthError(error) }
  return { ok: true }
}

// SIGN OUT — drop the account session and return to a fresh anonymous guest so
// the app keeps working (it never sits in a logged-out dead end).
export async function signOut() {
  if (!isSupabaseConfigured) return { ok: false }
  try {
    if (profileChannel) { try { supabase.removeChannel(profileChannel) } catch {} ; profileChannel = null }
    await supabase.auth.signOut()
    state = { ...DEFAULTS }; persistLocal(); notify()
    initPromise = null
    await ensureAuth()                     // new anonymous session + profile row
    return { ok: true }
  } catch (e) {
    return { ok: false, error: 'Could not sign out.' }
  }
}

// DELETE ACCOUNT — store-mandated (Apple 5.1.1(v) + Google Play). Calls the
// server `delete_user` RPC (a SECURITY DEFINER function that removes the
// player's data rows AND their auth.users row), then signs out into a fresh
// guest. See docs/auth-setup.md for the SQL to create that function.
export async function deleteAccount() {
  if (!isSupabaseConfigured) return { ok: false, error: 'Accounts are unavailable right now.' }
  try {
    const { error } = await supabase.rpc('delete_user')
    if (error) return { ok: false, error: 'Could not delete account: ' + error.message }
    try { localStorage.removeItem(MIGRATED_FLAG_KEY) } catch {}
    await signOut()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: 'Could not delete account. Try again.' }
  }
}

// Map Supabase's raw auth errors to friendlier copy.
function friendlyAuthError(error) {
  const m = (error?.message || '').toLowerCase()
  if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account. Try signing in instead.'
  if (m.includes('invalid login')) return 'Wrong email or password.'
  if (m.includes('email not confirmed')) return 'Check your email to confirm your account first.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts — wait a minute and try again.'
  if (m.includes('weak') || m.includes('password')) return `Password must be at least ${PASSWORD_MIN} characters.`
  return error?.message || 'Something went wrong. Try again.'
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
  await loadProfileForSession({ allowLocalMigration: true })
}

// Load (or reload) the profile for whatever Supabase session is currently
// active. Re-runnable: called on boot, and again after sign-in / sign-out so a
// fresh account's cloud save replaces the previous one. Tears down any prior
// realtime channel first so we don't leak subscriptions across logins.
async function loadProfileForSession({ allowLocalMigration = false } = {}) {
  const { data: userData } = await supabase.auth.getUser()
  const u = userData.user
  userId  = u?.id || null
  authEmail = u?.email || null
  isAnon  = u ? (u.is_anonymous ?? !u.email) : true
  notifyAuth()
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
  // localStorage keys, push them up and clear them. Only runs once, and only on
  // the initial anonymous boot (not when signing into an existing account).
  if (allowLocalMigration) {
    const isFreshRow      = (Date.now() - new Date(row.created_at).getTime()) < 60_000
    const alreadyMigrated = localStorage.getItem(MIGRATED_FLAG_KEY) === '1'
    if (isFreshRow && !alreadyMigrated) {
      const migrated = await migrateFromLocal(row)
      if (migrated) row = { ...row, ...migrated }
      try { localStorage.setItem(MIGRATED_FLAG_KEY, '1') } catch {}
    }
    // One-time: any account still on the shared 'SlickRico' default (fresh OR
    // existing) gets a unique random handle, so the shared map shows varied names
    // instead of a wall of identical defaults. Runs once per device (flag-gated);
    // players can still rename via SWAP afterward.
    if ((!row.display_name || row.display_name === PLAYER.name) && localStorage.getItem(HANDLE_FLAG_KEY) !== '1') {
      const handle = randomHandle()
      await pushToSupabase({ display_name: handle })
      row = { ...row, display_name: handle }
      try { localStorage.setItem(HANDLE_FLAG_KEY, '1') } catch {}
    }
  }

  // Adopt server state as authoritative (overrides the localStorage seed).
  state = { ...DEFAULTS, ...row }
  persistLocal()
  notify()

  // Realtime: keep the local cache in sync with any other tabs / devices.
  if (profileChannel) { try { supabase.removeChannel(profileChannel) } catch {} }
  profileChannel = supabase
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
