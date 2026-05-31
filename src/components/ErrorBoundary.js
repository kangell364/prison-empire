// App-wide error boundary.
//
// Without this, any single component that throws during render unmounts the
// whole React tree and the user sees a blank page (just the static page title).
// This catches the throw and shows the actual error plus a "Reset saved data"
// escape hatch — the usual culprit is old-shaped localStorage that newer code
// can't read.
//
// Deliberately self-contained: inline styles and no app imports, so it can't be
// taken down by the same breakage it's meant to report.

import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface it in the console too, so a real error report is available.
    console.error('App crashed:', error, info)
  }

  handleReset = () => {
    try { localStorage.clear() } catch {}
    try { sessionStorage.clear() } catch {}
    window.location.reload()
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error?.message || String(this.state.error)

    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.title}>Something broke.</div>
          <p style={styles.body}>
            The game hit an error and couldn't load. This is usually caused by
            outdated saved data after an update.
          </p>
          <pre style={styles.error}>{message}</pre>
          <div style={styles.row}>
            <button style={styles.primary} onClick={this.handleReset}>
              Reset saved data &amp; reload
            </button>
            <button style={styles.secondary} onClick={this.handleReload}>
              Just reload
            </button>
          </div>
          <p style={styles.note}>
            "Reset saved data" clears local progress on this device and starts fresh.
          </p>
        </div>
      </div>
    )
  }
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: '#0d0d10',
    color: '#f2f2f2',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxSizing: 'border-box',
  },
  card: {
    maxWidth: 420,
    width: '100%',
    background: '#17171c',
    border: '1px solid #2a2a32',
    borderRadius: 14,
    padding: '22px 20px',
  },
  title: { fontSize: 20, fontWeight: 800, marginBottom: 10, color: '#ff5c5c' },
  body: { fontSize: 14, lineHeight: 1.5, color: '#c9c9d2', margin: '0 0 14px' },
  error: {
    fontSize: 12,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    background: '#0d0d10',
    border: '1px solid #2a2a32',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#ff9b9b',
    margin: '0 0 16px',
    maxHeight: 160,
    overflow: 'auto',
  },
  row: { display: 'flex', gap: 10 },
  primary: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 10,
    border: 'none',
    background: '#e23b3b',
    color: '#fff',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
  },
  secondary: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 10,
    border: '1px solid #3a3a44',
    background: 'transparent',
    color: '#e2e2e8',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  },
  note: { fontSize: 11, color: '#7c7c88', margin: '14px 0 0', lineHeight: 1.4 },
}
