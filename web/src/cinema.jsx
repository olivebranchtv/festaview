import { lazy, Suspense, useEffect, useState } from 'react'
import { loadCinema, cinemaReserve, buyTicket, ticketFor, storeTicket, claimAccess, money } from './data.js'
import { cinemaPath, festivalPath } from './paths.js'
import { useSeo } from './seo.js'
import { bg } from './ui.jsx'
import { NotFoundPage } from './pages.jsx'

const CinemaRoom = lazy(() => import('./CinemaRoom.jsx'))

// ---------------------------------------------------------------- time and state helpers (all times shown in the viewer's own zone)
const zoneName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' } }
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA')
const dayLabel = (key, today) => {
  if (key === today) return 'Today'
  const d = new Date(key + 'T12:00:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
const fmtFull = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })

export function showState(s, now = Date.now()) {
  const start = new Date(s.starts_at).getTime()
  const filmEnd = start + s.runtime_min * 60000
  const end = new Date(s.ends_at).getTime()
  const lobby = start - s.lobby_minutes * 60000
  if (now >= end) return { key: 'ended', label: 'Ended' }
  if (now >= filmEnd) return { key: 'qa', label: 'Q&A and conversation', open: true }
  if (now >= start) return { key: 'playing', label: 'Now showing', open: true, into: Math.floor((now - start) / 1000) }
  if (now >= lobby) return { key: 'lobby', label: 'Doors open', open: true }
  return { key: 'soon', label: 'Starts ' + fmtTime(s.starts_at) }
}
const seatsLeft = (s) => (s.seats == null ? null : Math.max(0, s.seats - (s.taken || 0)))
const priceText = (s) => (s.price_cents > 0 ? money(s.price_cents) + ' ticket' : 'Free')
const seatText = (s) => { const l = seatsLeft(s); return l === null ? 'Open seating' : l === 0 ? 'Sold out' : l + (l === 1 ? ' seat left' : ' seats left') }
const mmss = (sec) => { const m = Math.floor(sec / 60), r = sec % 60; return m + ':' + String(r).padStart(2, '0') }

export function useCinema() {
  const [c, setC] = useState(null)
  const [, setTick] = useState(0)
  useEffect(() => {
    let stop = false
    const load = () => loadCinema().then((r) => { if (!stop) setC(r) })
    load()
    const t = setInterval(load, 30000)
    const k = setInterval(() => setTick((x) => x + 1), 15000)
    return () => { stop = true; clearInterval(t); clearInterval(k) }
  }, [])
  return c
}

function ShowingCard({ s }) {
  const st = showState(s)
  const sold = seatsLeft(s) === 0
  return (
    <a className={'show' + (st.open ? ' on' : '') + (sold ? ' sold' : '')} href={cinemaPath(s)}>
      <span className="show-time">{fmtTime(s.starts_at)}</span>
      <strong className="show-title">{s.title}</strong>
      <span className="show-meta">{[s.rating, s.runtime_min + ' min', s.kind === 'live' ? 'Live' : s.kind === 'program' ? 'Program' : null].filter(Boolean).join(' | ')}</span>
      <span className="show-meta">{s.festival_name}</span>
      <span className={'show-state' + (st.key === 'playing' || st.key === 'lobby' || st.key === 'qa' ? ' live' : '')}>
        {st.key === 'playing' ? 'Now showing. Join at ' + mmss(st.into) : st.label}{st.key !== 'ended' ? ' | ' + seatText(s) + ' | ' + priceText(s) : ''}
      </span>
    </a>
  )
}

// A small "Now showing" strip for the home page.
export function NowShowingStrip() {
  const c = useCinema()
  if (!c || !c.showings.length) return null
  const items = c.showings.filter((s) => showState(s).key !== 'ended').slice(0, 4)
  if (!items.length) return null
  return (
    <section className="block">
      <div className="sec-head"><h2>Now showing at Festaview Cinemas</h2><a className="more" href="/cinema">Full showtimes</a></div>
      <div className="show-grid">{items.map((s) => <ShowingCard key={s.id} s={s} />)}</div>
    </section>
  )
}

// ---------------------------------------------------------------- the marquee
export function CinemaPage() {
  useSeo({ title: 'Festaview Cinemas: Now Showing and Showtimes', description: 'Festaview Cinemas, the virtual theater. See what is playing on every screen and the showtimes, then watch together with everyone, from anywhere.' })
  const c = useCinema()
  const today = dayKey(new Date().toISOString())
  const [day, setDay] = useState(today)
  if (!c) return <section className="block"><h1>Festaview Cinemas</h1><p className="note">Loading showtimes...</p></section>

  const live = c.showings.filter((s) => { const k = showState(s).key; return k === 'playing' || k === 'lobby' || k === 'qa' })
  const days = [...new Set([today, ...c.showings.map((s) => dayKey(s.starts_at))])].sort().slice(0, 8)
  const onDay = c.showings.filter((s) => dayKey(s.starts_at) === day && showState(s).key !== 'ended')
  const screens = c.screens.filter((sc) => onDay.some((s) => s.screen_id === sc.id))

  return (
    <section className="block marquee">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Festaview Cinemas</span></nav>
      <h1>Festaview Cinemas</h1>
      <p className="lede">Scheduled showings on numbered screens. Everyone watches together, and you can join late. All times are in your own time zone{zoneName() ? ' (' + zoneName() + ')' : ''}.</p>

      {live.length > 0 && (
        <>
          <h2>Now showing</h2>
          <div className="show-grid">{live.map((s) => <ShowingCard key={s.id} s={s} />)}</div>
        </>
      )}

      <h2>Showtimes</h2>
      <div className="chips" role="tablist" aria-label="Day">
        {days.map((d) => <button key={d} role="tab" aria-selected={d === day} className={'chip' + (d === day ? ' on' : '')} onClick={() => setDay(d)}>{dayLabel(d, today)}</button>)}
      </div>
      {screens.length === 0 ? (
        <div className="access"><h3 className="h3">No showings on this day</h3><p className="note">Try another day, or check back soon. Festivals and filmmakers add showings all the time.</p></div>
      ) : (
        <div className="screens">
          {screens.map((sc) => (
            <div key={sc.id} className="screen-row">
              <div className="screen-name">{sc.name}</div>
              <div className="screen-shows">
                {onDay.filter((s) => s.screen_id === sc.id).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).map((s) => <ShowingCard key={s.id} s={s} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- one showing
const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
function downloadIcs(s) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Festaview//Theater//EN', 'BEGIN:VEVENT', 'UID:' + s.id + '@festaview', 'DTSTAMP:' + icsStamp(new Date().toISOString()),
    'DTSTART:' + icsStamp(s.starts_at), 'DTEND:' + icsStamp(s.ends_at), 'SUMMARY:' + s.title.replace(/[,;]/g, ' ') + ' - Festaview Cinemas', 'URL:' + window.location.origin + cinemaPath(s), 'END:VEVENT', 'END:VCALENDAR']
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }))
  a.download = 'festaview-showing.ics'
  a.click()
  URL.revokeObjectURL(a.href)
}

export function ShowingPage({ id }) {
  const c = useCinema()
  const s = c && c.showings.find((x) => x.id === id)
  const [inRoom, setInRoom] = useState(false)
  const [reserved, setReserved] = useState(false)
  const [msg, setMsg] = useState('')
  const [code, setCode] = useState(() => ticketFor(id))
  const [typed, setTyped] = useState('')
  const [paying, setPaying] = useState(false)
  const [note, setNote] = useState('')
  // Coming back from the card payment page: collect the new ticket code.
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get('session_id')
    if (!sid || code) return
    let stop = false, tries = 0
    setNote('Confirming your payment...')
    const poll = async () => {
      const j = await claimAccess(sid)
      if (stop) return
      if (j.status === 'ready' && j.ticketCode && j.showingId === id) { storeTicket(id, j.ticketCode); setCode(j.ticketCode); setNote(''); return }
      if (++tries < 20) setTimeout(poll, 2500); else setNote('Your payment is still being confirmed. Refresh this page in a minute, or contact the festival if you were charged.')
    }
    poll()
    return () => { stop = true }
  }, [id, code])
  useSeo(s ? { title: s.title + ': Showing at Festaview Cinemas', description: (s.description || 'Watch ' + s.title + ' at Festaview Cinemas.') + ' ' + s.screen_name + '.', canonicalPath: cinemaPath(s), image: s.poster_url || undefined } : { title: c ? 'Showing not found' : 'Festaview Cinemas', robots: c ? 'noindex' : 'index,follow' })
  if (!c) return <section className="block"><p className="note">Loading...</p></section>
  if (!s) return <NotFoundPage />

  const st = showState(s)
  const left = seatsLeft(s)
  const sold = left === 0
  const reserve = async () => {
    setMsg('')
    const r = await cinemaReserve(s.id)
    if (r.status === 'ok') setReserved(true); else setMsg(r.status === 'full' ? 'Sorry, this showing is sold out.' : 'Could not reserve a seat. Please try again.')
  }

  const paid = s.price_cents > 0
  const buy = async () => {
    setMsg(''); setPaying(true)
    const r = await buyTicket(s.id)
    if (r.ok && r.demo) { setCode(ticketFor(s.id)); setPaying(false); return }
    if (r.ok) { window.location.href = r.url; return }
    setMsg(r.message); setPaying(false)
  }
  const useCode = () => {
    const c = typed.trim().toUpperCase()
    if (!/^FV-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) { setMsg('That does not look like a ticket code. It starts with FV-.'); return }
    storeTicket(s.id, c); setCode(c); setMsg(''); setTyped('')
  }

  if (inRoom) {
    return (
      <section className="block room">
        <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/cinema">Festaview Cinemas</a> / <span>{s.title}</span></nav>
        <Suspense fallback={<p className="note">Opening the theater...</p>}><CinemaRoom showing={s} onLeave={() => setInRoom(false)} /></Suspense>
      </section>
    )
  }

  return (
    <article className="block film-page">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/cinema">Festaview Cinemas</a> / <span>{s.title}</span></nav>
      <div className="film-grid">
        <div className="film-media">
          <div className="modal-art" style={s.poster_url ? undefined : bg()}>{s.poster_url ? <img src={s.poster_url} alt={'Poster for ' + s.title} /> : <div className="spot-fallback">{s.title}</div>}</div>
        </div>
        <div className="film-info">
          <p className="eyebrow">{s.screen_name}</p>
          <h1>{s.title}</h1>
          <p className="meta">{[s.rating, s.runtime_min + ' min', s.kind === 'live' ? 'Live event' : s.kind === 'program' ? 'Program' : 'Film'].filter(Boolean).join('  |  ')}</p>
          <p className="meta">Presented by <a href={festivalPath({ slug: s.festival_slug })}>{s.festival_name}</a></p>
          <p>{s.description}</p>
          <ul className="facts-line">
            <li><span className={'pill ' + (st.open ? 'live' : st.key === 'ended' ? 'draft' : 'published')}>{st.label}</span></li>
            <li>{fmtFull(s.starts_at)}</li>
            <li>{seatText(s)}</li>
            <li>{priceText(s)}</li>
            <li>Doors open {s.lobby_minutes} minutes early</li>
          </ul>
          {st.key === 'ended' && <p className="note">This showing has ended. <a href="/cinema">See what is playing now</a>.</p>}
          {st.key !== 'ended' && (
            <div className="actions">
              {paid && !code && !sold && st.key !== 'ended' && <button className="btn" onClick={buy} disabled={paying}>{paying ? 'Opening payment...' : 'Buy a ticket for ' + money(s.price_cents)}</button>}
              {st.open && !sold && (!paid || code) && <button className="btn" onClick={() => setInRoom(true)}>{st.key === 'playing' ? 'Join now at ' + mmss(st.into) : st.key === 'qa' ? 'Join the conversation' : 'Enter the theater'}</button>}
              {!paid && !st.open && !sold && !reserved && <button className="btn" onClick={reserve}>Reserve a seat</button>}
              {paid && code && !st.open && <span className="ok">You have a ticket. Come back when the doors open.</span>}
              {!st.open && !sold && reserved && <span className="ok">Seat reserved. Come back when the doors open.</span>}
              {sold && !code && <span className="btn disabled">Sold out</span>}
              {st.key !== 'ended' && <button className="btn ghost" onClick={() => downloadIcs(s)}>Add to calendar</button>}
            </div>
          )}
          {note && <p className="note">{note}</p>}
          {paid && code && <p className="note">Your ticket code: <strong>{code}</strong>. It is saved on this device. Keep it to watch from another device.</p>}
          {paid && !code && st.key !== 'ended' && (
            <div className="inline-form">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Already bought? Enter your ticket code" aria-label="Ticket code" />
              <button type="button" className="btn ghost" onClick={useCode}>Use code</button>
            </div>
          )}
          {msg && <p className="error">{msg}</p>}
          <p className="note small">Everyone watches at the same time. If you arrive late, you join at the live point. Times are shown in your time zone{zoneName() ? ' (' + zoneName() + ')' : ''}. Want it on the big screen? <a href="/watch-on-tv">See how to watch on your TV</a>.</p>
        </div>
      </div>
    </article>
  )
}
