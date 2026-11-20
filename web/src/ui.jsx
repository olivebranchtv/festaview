import { useEffect, useState } from 'react'
import { castVote, unlockStream, storedCode, storeCode, startCheckout } from './data.js'
import { nowOn, clock } from './channels.js'
import { eventState, kindLabel } from './virtual.js'
import { filmPath, eventPath, channelPath } from './paths.js'
import { ROKU_URL } from './config.js'

// Small building blocks shared by every page.
export const bg = (color) => ({ background: 'linear-gradient(135deg, ' + (color || '#E6B34A') + ' 0%, #14141f 78%)' })

export function useTick(ms) {
  const [, set] = useState(0)
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t) }, [ms])
}

export function formatPrice(p) {
  try { return (p.price_cents / 100).toLocaleString(undefined, { style: 'currency', currency: (p.currency || 'usd').toUpperCase() }) } catch { return '$' + (p.price_cents / 100).toFixed(2) }
}

export function accentText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#14110a'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#14110a' : '#ffffff'
}

export function fmtDates(a, b) {
  if (!a) return ''
  const d1 = new Date(a + 'T12:00:00')
  const d2 = b ? new Date(b + 'T12:00:00') : null
  const md = { month: 'long', day: 'numeric' }
  if (!d2 || +d1 === +d2) return d1.toLocaleDateString(undefined, { ...md, year: 'numeric' })
  const same = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()
  return d1.toLocaleDateString(undefined, md) + ' - ' + (same ? d2.getDate() : d2.toLocaleDateString(undefined, md)) + ', ' + d2.getFullYear()
}

export function RokuButton({ className }) {
  return ROKU_URL ? (
    <a className={'btn ' + (className || '')} href={ROKU_URL} target="_blank" rel="noreferrer">Get the Roku app</a>
  ) : (
    <a className={'btn ' + (className || '')} href="/watch">Roku app coming soon</a>
  )
}

export function FilmCard({ film, festival }) {
  return (
    <a className="card" href={filmPath(film)}>
      <div className="poster" style={film.poster_url ? undefined : bg(festival && festival.brand_color)}>
        {film.poster_url ? <img src={film.poster_url} alt={'Poster for ' + film.title} loading="lazy" width="320" height="180" /> : <span>{film.title}</span>}
        {film.access === 'ticketed' && <span className="ticket-badge">Ticketed</span>}
      </div>
      <div className="card-title">{film.title}</div>
      <div className="card-meta">
        {[film.category, film.director, film.runtime_min ? film.runtime_min + ' min' : null, film.genre].filter(Boolean).join(' / ')}
      </div>
      {festival && <div className="card-fest">{festival.name}</div>}
    </a>
  )
}

export function VoteButton({ film }) {
  const key = 'fv_voted'
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }
  const [state, setState] = useState(read().includes(film.id) ? 'done' : 'idle')
  const [msg, setMsg] = useState('')
  const vote = async () => {
    setState('busy')
    const r = await castVote(film)
    if (r.ok || r.duplicate) {
      try { localStorage.setItem(key, JSON.stringify([...read(), film.id])) } catch { /* ignore */ }
      setState('done')
      setMsg(r.duplicate ? 'You already voted for this film.' : 'Thanks for voting.')
    } else {
      setState('idle')
      setMsg('Voting is not available right now.')
    }
  }
  return (
    <span className="vote">
      <button className="btn ghost" onClick={vote} disabled={state !== 'idle'}>
        {state === 'done' ? 'Voted' : 'Vote Audience Choice'}
      </button>
      {msg && <small className="note">{msg}</small>}
    </span>
  )
}

// Shown instead of the film when it is ticketed: enter an access code, or buy a pass or ticket.
export function AccessPanel({ film, festival, products, onUnlocked }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = (products || []).filter((p) => p.festival_id === film.festival_id && !p.event_id && (!p.film_id || p.film_id === film.id))
  const unlock = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg('')
    const url = await unlockStream(film.id, code)
    setBusy(false)
    if (url) { storeCode(film.festival_id, code.trim().toUpperCase()); onUnlocked(url) } else setMsg('That code did not work for this film.')
  }
  const buy = async (p) => {
    setMsg('')
    const r = await startCheckout(p.id)
    if (r.ok) window.location.href = r.url; else setMsg(r.message)
  }
  return (
    <div className="access">
      <h2 className="h3">This is a ticketed screening</h2>
      {festival && festival.payments_enabled && mine.length > 0 && (
        <div className="products">
          {mine.map((p) => (
            <div key={p.id} className="product">
              <div><strong>{p.name}</strong>{p.description && <small>{p.description}</small>}</div>
              <button className="btn" onClick={() => buy(p)}>{formatPrice(p)}</button>
            </div>
          ))}
        </div>
      )}
      {festival && !festival.payments_enabled && festival.passes_url && (
        <p><a className="btn" href={festival.passes_url} target="_blank" rel="noreferrer">Get passes or tickets</a></p>
      )}
      <form className="inline-form" onSubmit={unlock}>
        <input placeholder="Have an access code?" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Access code" />
        <button className="btn ghost" type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking...' : 'Unlock'}</button>
      </form>
      {msg && <p className="error">{msg}</p>}
    </div>
  )
}

export function EventCard({ ev, fest }) {
  const st = eventState(ev)
  return (
    <a className="event" href={eventPath(ev)}>
      <div className="event-art" style={ev.poster_url ? { backgroundImage: 'url(' + ev.poster_url + ')' } : bg(fest && fest.brand_color)}>
        <span className={'pill ' + (st.live ? 'live' : '')}>{st.live ? 'Live now' : kindLabel[ev.kind]}</span>
      </div>
      <div className="event-body">
        <h3 className="event-title">{ev.title}</h3>
        {fest && <div className="event-meta">{fest.name}</div>}
        <div className="event-when">{st.label}  |  {ev.access === 'ticketed' ? 'Ticketed' : 'Free'}</div>
      </div>
    </a>
  )
}

export function ChannelRow({ ch }) {
  const n = nowOn(ch)
  const pct = Math.min(100, (n.offset / n.item.duration) * 100)
  return (
    <a className="guide-row" href={channelPath(ch)}>
      <span className="ch-num" style={{ background: ch.color }}>{ch.number}</span>
      <span className="ch-main">
        <span className="ch-name"><span className="pill live">Live</span> {ch.name}</span>
        <span className="ch-now">{n.item.title}</span>
        <span className="ch-bar"><i style={{ width: pct + '%', background: ch.color }} /></span>
      </span>
      <span className="ch-next">{clock(n.remaining)} left{ch.items.length > 1 ? ' | Up next: ' + n.next.title : ''}</span>
    </a>
  )
}
