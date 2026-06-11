// Slot machine config — 5×3 reels. Symbols are CREW faces; the JACKPOT symbol is
// the "baddie" player-look card. Pure (no React) so the RTP can be verified by
// Monte-Carlo simulation (see the tune script comment at the bottom).
//
// EARN-ONLY cash sink: you bet Hustle you earned, winnings are Hustle, no cash-out,
// no real-money chips — so it stays in the "simulated gambling" lane AND net-burns
// cash. RTP is tuned BELOW 100% (≈88%), i.e. a ~12% house edge that quietly drains
// surplus Hustle from players who have more than they need.

export const REELS = 5
export const ROWS = 3

// tier → payout multiplier of the TOTAL BET for 3 / 4 / 5 of a kind on a payline.
const PAY = {
  low:     { 3: 3,  4: 9,   5: 28 },
  mid:     { 3: 5,  4: 20,  5: 80 },
  high:    { 3: 12, 4: 45,  5: 170 },
  jackpot: { 3: 45, 4: 400, 5: 3000 },
}

// Symbols + their reel weight (higher = more common). The baddie is rare → it's
// the jackpot. img is shown on the reels; for the baddie we also splash the full art.
export const SYMBOLS = [
  { id: 'scrappy',   name: 'Scrappy',   img: '/crew-5-face.webp',   tier: 'low',     weight: 28 },
  { id: 'lilsmoke',  name: 'Lil Smoke', img: '/crew-2-face.webp',   tier: 'low',     weight: 25 },
  { id: 'reup',      name: 'Re-Up',     img: '/crew-3-face.webp',   tier: 'low',     weight: 22 },
  { id: 'quickdraw', name: 'Quickdraw', img: '/crew-8-face.webp',   tier: 'mid',     weight: 15 },
  { id: 'cinder',    name: 'Cinder',    img: '/crew-10-face.webp',  tier: 'mid',     weight: 12 },
  { id: 'slimjaws',  name: 'Slim Jaws', img: '/crew-15-face.webp',  tier: 'high',    weight: 8 },
  { id: 'outcast',   name: 'Outcast',   img: '/crew-1-face.webp',   tier: 'high',    weight: 5 },
  { id: 'baddie',    name: 'Baddie',    img: '/player-look-153.jpg', tier: 'jackpot', weight: 3, jackpot: true },
]

export const SYM_BY_ID = Object.fromEntries(SYMBOLS.map(s => [s.id, s]))
const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0)

// Weighted random symbol id.
export function pickSymbol(rng = Math.random) {
  let r = rng() * TOTAL_WEIGHT
  for (const s of SYMBOLS) { if ((r -= s.weight) < 0) return s.id }
  return SYMBOLS[0].id
}

// A full 5×3 result grid: grid[reel][row] = symbol id.
export function drawGrid(rng = Math.random) {
  const grid = []
  for (let r = 0; r < REELS; r++) {
    const col = []
    for (let row = 0; row < ROWS; row++) col.push(pickSymbol(rng))
    grid.push(col)
  }
  return grid
}

// 5 paylines over the 3 rows (row index per reel): middle, top, bottom, V, ^.
export const PAYLINES = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
]

// Evaluate a grid for a given TOTAL bet. Pays left-to-right: 3+ of the same symbol
// from reel 0 along a payline. Returns { total, wins:[{line,symbol,count,amt,jackpot}] }.
export function evaluateSpin(grid, bet) {
  let total = 0
  const wins = []
  PAYLINES.forEach((line, li) => {
    const first = grid[0][line[0]]
    let count = 1
    for (let r = 1; r < REELS; r++) { if (grid[r][line[r]] === first) count++; else break }
    if (count >= 3) {
      const sym = SYM_BY_ID[first]
      const mult = (PAY[sym.tier] || {})[count] || 0
      if (mult > 0) {
        const amt = Math.round(bet * mult)
        total += amt
        wins.push({ line: li, symbol: first, count, amt, jackpot: !!sym.jackpot && count === 5 })
      }
    }
  })
  return { total, wins }
}

// ---- RTP self-check (run with: node src/data/slotConfig.js) -------------------
// Monte-Carlos a few million spins and prints return-to-player. Keep RTP < 1.0.
if (typeof require !== 'undefined' && require.main === module) {
  const N = 5_000_000, bet = 100
  let paid = 0, jackpots = 0, hitSpins = 0
  for (let i = 0; i < N; i++) {
    const { total, wins } = evaluateSpin(drawGrid(), bet)
    paid += total
    if (total > 0) hitSpins++
    if (wins.some(w => w.jackpot)) jackpots++
  }
  const wagered = N * bet
  console.log(`spins=${N} RTP=${(paid / wagered * 100).toFixed(2)}% houseEdge=${(100 - paid / wagered * 100).toFixed(2)}% hit%=${(hitSpins / N * 100).toFixed(1)} jackpots=${jackpots} (1 in ${Math.round(N / Math.max(1, jackpots))})`)
}
