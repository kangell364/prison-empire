import React, { useState } from 'react'
import { PLAYER_LOOKS, RARITY_COLORS } from '../data/gameData'
import {
  usePlayerLook, setPlayerLook,
  useDisplayName, setDisplayName, NAME_MAX_LEN,
} from '../state/profileStore'
import { CharacterDetailModal } from './CharacterDetailModal'
import { sfx } from '../sounds'

// Full-screen overlay reached only from the home-screen SWAP button. Shows the
// curated, cosmetic-only player-look cards (no stats) at 2x the home card size,
// plus a Change Name control. Picking a card swaps the player's look and closes
// back to the home screen.
export function SwapLookModal({ onClose }) {
  const currentId = usePlayerLook()
  const name      = useDisplayName()
  const [detail, setDetail]           = useState(null)   // a look opened in the big card view
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft]     = useState(name)

  const swapTo = (id) => {
    setPlayerLook(id)
    sfx.buy?.()
    onClose()
  }

  const saveName = () => {
    setDisplayName(nameDraft)
    setEditingName(false)
    sfx.tap?.()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', zIndex: 300, overflowY: 'auto' }}>
      {/* Header: Back · title · Change Name */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 6px' }}>
        <button className="btn btn-dark" onClick={onClose} style={{ padding: '8px 12px', fontSize: 13 }}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        <div style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>Choose Your Card</div>
        <button
          className="btn"
          onClick={() => { setNameDraft(name); setEditingName(true) }}
          style={{ padding: '8px 12px', background: '#1e1e2a', border: '0.5px solid #2a2a3a', color: '#c9a84c', fontSize: 12, borderRadius: 10 }}
        >
          <i className="ti ti-edit" /> Change Name
        </button>
      </div>

      <div style={{ padding: '0 16px 10px', color: '#555', fontSize: 12 }}>
        Playing as <span style={{ color: '#fff', fontWeight: 600 }}>{name}</span> — pick a new look. This only changes your card, not your level.
      </div>

      {/* Look cards at 2x the home card size (home art is 70x92 → 140x184) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '6px 16px 110px', justifyItems: 'center' }}>
        {PLAYER_LOOKS.map(look => (
          <LookCard
            key={look.id}
            look={look}
            equipped={look.id === currentId}
            onOpen={() => setDetail(look)}
            onSwap={() => swapTo(look.id)}
          />
        ))}
      </div>

      {/* Open a look in the same big card view as any other card. The action
          reflects whether it's the one already equipped. */}
      {detail && (
        <CharacterDetailModal
          character={detail}
          cardType="PLAYER CARD"
          actions={[
            detail.id === currentId
              ? { label: 'EQUIPPED', icon: 'ti-check', kind: 'secondary', onClick: () => {} }
              : { label: 'SWAP TO THIS CARD', icon: 'ti-repeat', onClick: () => swapTo(detail.id) },
          ]}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Change-name dialog */}
      {editingName && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320 }}
          onClick={() => setEditingName(false)}
        >
          <div style={{ background: '#13131f', borderRadius: 16, padding: 20, width: '100%', maxWidth: 320, margin: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Change Name</div>
            <input
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value.slice(0, NAME_MAX_LEN))}
              maxLength={NAME_MAX_LEN}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
              style={{ width: '100%', boxSizing: 'border-box', background: '#0a0a0f', border: '0.5px solid #2a2a3a', borderRadius: 10, padding: '12px 14px', color: '#fff', fontSize: 15, marginBottom: 6 }}
            />
            {/* Live counter — counts every character including spaces. */}
            <div style={{ textAlign: 'right', color: nameDraft.length >= NAME_MAX_LEN ? '#e74c3c' : '#555', fontSize: 11, marginBottom: 14 }}>
              {nameDraft.length}/{NAME_MAX_LEN}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-dark" style={{ flex: 1, padding: 12 }} onClick={() => setEditingName(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, padding: 12 }} onClick={saveName} disabled={!nameDraft.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LookCard({ look, equipped, onOpen, onSwap }) {
  const color = RARITY_COLORS[look.rarity] || '#c9a84c'
  return (
    <div style={{ width: 140 }}>
      <div
        onClick={onOpen}
        style={{
          width: 140, height: 184, borderRadius: 14, position: 'relative', overflow: 'hidden',
          background: '#1a1a2e', border: `1px solid ${color}66`, cursor: 'pointer',
        }}
      >
        {look.avatar
          ? <img src={look.avatar} alt={look.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }} />
          : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 54 }}>{look.emoji}</div>}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: color }} />
        {equipped && (
          <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(10,10,15,0.85)', border: `0.5px solid ${color}`, color: '#fff', fontSize: 8, fontWeight: 800, letterSpacing: 1, borderRadius: 4, padding: '2px 6px' }}>EQUIPPED</div>
        )}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.85) 60%)', padding: '20px 6px 7px' }}>
          <div style={{ color, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textAlign: 'center' }}>{look.name.toUpperCase()}</div>
        </div>
      </div>
      <button
        onClick={onSwap}
        className="btn"
        style={{
          width: 140, marginTop: 8, padding: '9px 0', borderRadius: 8,
          background: equipped ? '#1e1e2a' : color,
          color: equipped ? '#555' : '#0a0a0f',
          border: equipped ? '0.5px solid #2a2a3a' : 'none',
          fontSize: 11, fontWeight: 800, letterSpacing: 1.2,
          cursor: equipped ? 'default' : 'pointer',
        }}
        disabled={equipped}
      >
        {equipped ? 'EQUIPPED' : 'SWAP'}
      </button>
    </div>
  )
}
