// chatStore — global "World Chat". SINGLETON (one fetch + one realtime channel
// shared by every consumer), same pattern as the houses/raids stores so we never
// double-subscribe and crash. Loads the most recent messages and appends new
// ones live. Sender identity (name + look) is resolved in the UI via playersStore.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'
import { getUserId } from './profileStore'

const LIMIT = 80                 // most-recent messages kept in memory / shown
const MAX_LEN = 280

let cache = []                   // ascending by created_at
let started = false
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn(cache))

async function loadChat() {
  const { data } = await supabase
    .from('chat_messages').select('*').order('created_at', { ascending: false }).limit(LIMIT)
  if (data) { cache = data.reverse(); notify() }
}

function startChat() {
  if (started || !isSupabaseConfigured) return
  started = true
  loadChat()
  // Defensive: drop any stale channel with this topic before subscribing.
  try {
    const existing = supabase.getChannels ? supabase.getChannels() : []
    existing.forEach(c => { if (c.topic === 'realtime:world_chat') { try { supabase.removeChannel(c) } catch {} } })
  } catch {}
  supabase.channel('world_chat')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, payload => {
      if (cache.some(m => m.id === payload.new.id)) return     // de-dupe
      cache = [...cache, payload.new].slice(-LIMIT)
      notify()
    })
    .subscribe()
}

export function useChat() {
  const [msgs, setMsgs] = useState(cache)
  useEffect(() => {
    listeners.add(setMsgs)
    startChat()
    setMsgs(cache)
    return () => listeners.delete(setMsgs)
  }, [])
  return msgs
}

// Post a message. Returns { ok, error? }. user_id defaults to auth.uid() via the
// table default + RLS, so we don't send it.
export async function sendMessage(body) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Chat is offline.' }
  const text = (body || '').trim().slice(0, MAX_LEN)
  if (!text) return { ok: false, error: 'empty' }
  if (!getUserId()) return { ok: false, error: 'no-auth' }
  const { error } = await supabase.from('chat_messages').insert({ body: text })
  return { ok: !error, error: error?.message }
}
