// Name moderation — keeps display names PG. A bundled, offline, editable word
// list (LDNOOBW-style) with leetspeak-aware, evasion-resistant matching that
// still avoids the classic "Scunthorpe problem" (innocent words that merely
// CONTAIN a bad substring — Scunthorpe, assassin, cockpit…).
//
// Strategy:
//   SEVERE — unambiguous profanity/slurs. Matched as a substring of the
//            de-spaced/leet-normalized name, so "F.u.c.k You" and "shitlord"
//            are both caught. False positives are handled by ALLOWLIST.
//   MILD   — mild words only blocked as a STANDALONE token ("damn" the name,
//            not "damnation"), so common words slip through.
//   ALLOWLIST — innocent words that contain a SEVERE substring; never blocked.
//
// To tune: add/remove words below. No build step, no dependency.

const SEVERE = [
  'fuck', 'fuk', 'fck', 'shit', 'cunt', 'bitch', 'bastard', 'dick', 'cock',
  'pussy', 'whore', 'slut', 'fag', 'faggot', 'nigger', 'nigga', 'retard',
  'rape', 'rapist', 'molest', 'pedo', 'pedophile', 'kike', 'spic', 'chink',
  'wetback', 'coon', 'tranny', 'dyke', 'jizz', 'cum', 'dildo', 'wank',
  'jerkoff', 'blowjob', 'handjob', 'creampie', 'felch', 'rimjob', 'goatse',
  'nazi', 'hitler', 'klan', 'kkk', 'beaner', 'gook', 'twat', 'bollock',
  'arsehole', 'asshole', 'shithead', 'motherfucker', 'cocksucker', 'jackoff',
]

const MILD = [
  'ass', 'arse', 'hell', 'damn', 'crap', 'piss', 'sex', 'sexy', 'penis',
  'vagina', 'boob', 'boobs', 'tit', 'tits', 'hoe', 'butt', 'turd', 'pron',
  'porn', 'horny', 'bukkake', 'milf',
]

// Innocent words that contain a SEVERE substring — never block these.
const ALLOWLIST = [
  'scunthorpe', 'penistone', 'lightwater', 'assassin', 'assassins',
  'assassinate', 'assistant', 'assist', 'assess', 'class', 'classic',
  'bass', 'pass', 'passage', 'grass', 'glass', 'brass', 'mass', 'massive',
  'compass', 'embarrass', 'cockpit', 'cocktail', 'peacock', 'hancock',
  'shuttlecock', 'woodcock', 'dickson', 'dickinson', 'shitake', 'shiitake',
  'grape', 'grapes', 'scrape', 'drape', 'therapist', 'therapists',
  'analysis', 'analyst', 'matchstick', 'cumulus', 'cumberland', 'scumbag',
  'document', 'circumstance', 'cucumber', 'titan', 'titanic', 'title',
  'constitution', 'sussex', 'essex', 'middlesex', 'wankel',
]

const SEVERE_SET = new Set(SEVERE)
const MILD_SET   = new Set(MILD)
const ALLOW_SET  = new Set(ALLOWLIST)

// Leetspeak / homoglyph fold to plain letters.
const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '6': 'g', '2': 'z' }

// Normalize: lowercase, fold leetspeak, collapse 3+ repeats of a letter to one
// (so "fuuuuck" → "fuck"). Non-letters survive as separators for tokenizing.
function normalize(s) {
  const lowered = String(s || '').toLowerCase()
  let out = ''
  for (const ch of lowered) out += (LEET[ch] || ch)
  return out.replace(/([a-z])\1{2,}/g, '$1')
}

// Merge consecutive single-character tokens into one word: ['f','u','c','k'] →
// ['fuck']; ['grape','ape'] → [] (no single-char run). Multi-letter tokens are
// checked on their own, so this only undoes letter-by-letter separator evasion.
function mergeSingleCharRuns(tokens) {
  const out = []
  let buf = ''
  for (const t of tokens) {
    if (t.length === 1) { buf += t }
    else if (buf) { out.push(buf); buf = '' }
  }
  if (buf) out.push(buf)
  return out
}

// Returns { ok } or { ok:false, reason }.
export function checkName(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return { ok: false, reason: 'Enter a name.' }

  const norm = normalize(trimmed)
  const tokens = norm.split(/[^a-z]+/).filter(Boolean)
  // Merge runs of SINGLE characters back into words — beats "f.u.c.k" / "p u s s y"
  // evasion without spanning real word boundaries (so "grape ape" stays two words).
  const merged = mergeSingleCharRuns(tokens)
  const collapsed = norm.replace(/[^a-z]/g, '')   // whole name de-spaced

  // 1) MILD + SEVERE as a STANDALONE word — a token, a merged single-char run,
  //    or the whole de-spaced name matching a bad word EXACTLY (e.g. "fu ck").
  for (const t of [...tokens, ...merged, collapsed]) {
    if (ALLOW_SET.has(t)) continue
    if (MILD_SET.has(t) || SEVERE_SET.has(t)) return blocked(t)
  }

  // 2) SEVERE as a substring (catches concatenations like "shitlord"). Checked
  //    only within a single token or merged run — never across the whole
  //    collapsed name — so "cockpit joe"/"grape ape"/"assassin" stay clean.
  for (const w of SEVERE) {
    for (const t of [...tokens, ...merged]) {
      if (t.includes(w) && !ALLOW_SET.has(t)) return blocked(w)
    }
  }

  return { ok: true }
}

function blocked() {
  return {
    ok: false,
    reason: "That name contains language we don't allow. Pick something else — keep it clean.",
  }
}

// Convenience boolean for callers that just need a gate.
export function isNameAllowed(raw) { return checkName(raw).ok }
