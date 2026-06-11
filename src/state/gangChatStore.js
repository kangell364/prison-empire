// gangChatStore — gang-scoped chat. Same singleton/realtime pattern as
// chatStore (world chat), but scoped to ONE room at a time: the room id of the
// player's current gang. Everyone whose active gang resolves to the same room id
// reads + writes the same stream — so joining a gang drops you into its chat and
// leaving cuts you off, with no membership table needed (the room id IS the
// gate). Backed by the `gang_chat_messages` table (see public/gang_chat.txt).
//
// Room id: a joined AI gang uses its stable id ('g_yard', …). A player-FOUNDED
// gang has the local id 'mine' (shared by every founder), so the caller scopes
// it per-user as `mine:<userId>` — see gangRoomId() below — to avoid cross-talk
// until real server-side gangs land.

import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../supabase'
import { getUserId } from './profileStore'

const LIMIT = 80
const MAX_LEN = 280

let activeRoom = null            // the room id we're currently subscribed to
let cache = []                   // ascending by created_at, for activeRoom
let channel = null
const listeners = new Set()
const notify = () => listeners.forEach(fn => fn(cache))

// Stable chat-room id for a gang object + the current user.
export function gangRoomId(gang, userId) {
  if (!gang || !gang.id) return null
  return gang.id === 'mine' ? `mine:${userId || getUserId() || 'anon'}` : gang.id
}

function teardown() {
  if (channel) { try { supabase.removeChannel(channel) } catch {} ; channel = null }
}

async function loadRoom(roomId) {
  const { data } = await supabase
    .from('gang_chat_messages').select('*')
    .eq('gang_id', roomId)
    .order('created_at', { ascending: false }).limit(LIMIT)
  if (roomId !== activeRoom) return            // room changed mid-flight
  cache = data ? data.reverse() : []
  notify()
}

function subscribeRoom(roomId) {
  // Defensive: drop any stale gang-chat channel before subscribing.
  try {
    const existing = supabase.getChannels ? supabase.getChannels() : []
    existing.forEach(c => { if (c.topic && c.topic.startsWith('realtime:gang_chat:')) { try { supabase.removeChannel(c) } catch {} } })
  } catch {}
  channel = supabase.channel(`gang_chat:${roomId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'gang_chat_messages', filter: `gang_id=eq.${roomId}` },
      payload => {
        if (roomId !== activeRoom) return
        if (cache.some(m => m.id === payload.new.id)) return    // de-dupe
        cache = [...cache, payload.new].slice(-LIMIT)
        notify()
      })
    .subscribe()
}

// Point the store at a room (the player's current gang). No-op if unchanged.
function setRoom(roomId) {
  if (roomId === activeRoom) return
  activeRoom = roomId
  cache = []
  notify()
  teardown()
  if (roomId && isSupabaseConfigured) { loadRoom(roomId); subscribeRoom(roomId) }
}

// Subscribe a component to the chat for `roomId`. Switching rooms reloads.
export function useGangChat(roomId) {
  const [msgs, setMsgs] = useState(roomId === activeRoom ? cache : [])
  useEffect(() => {
    listeners.add(setMsgs)
    setRoom(roomId)
    setMsgs(roomId === activeRoom ? cache : [])
    return () => listeners.delete(setMsgs)
  }, [roomId])
  return msgs
}

// Post to a gang room. user_id defaults to auth.uid() via the table default+RLS.
export async function sendGangMessage(roomId, body) {
  if (!isSupabaseConfigured) return { ok: false, error: 'Chat is offline.' }
  if (!roomId) return { ok: false, error: 'no-gang' }
  const text = (body || '').trim().slice(0, MAX_LEN)
  if (!text) return { ok: false, error: 'empty' }
  if (!getUserId()) return { ok: false, error: 'no-auth' }
  const { error } = await supabase.from('gang_chat_messages').insert({ gang_id: roomId, body: text })
  return { ok: !error, error: error?.message }
}
