// Supabase client singleton.
//
// Exports `null` when env vars are missing so the app gracefully falls back
// to localStorage (every store checks `if (!supabase)`). This lets the app
// keep working before the backend project exists, on Vercel previews without
// secrets, and in CI where there's nothing to point at.

import { createClient } from '@supabase/supabase-js'

const url = process.env.REACT_APP_SUPABASE_URL
const key = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

export const isSupabaseConfigured = !!supabase
