import { lazy, Suspense, useEffect, useState } from 'react'
import { loadCinema, cinemaReserve } from './data.js'
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
        {st.key === 'playing' ? 'Now showing. Join at ' + mmss(st.into) : st.label}{st.key !== 'ended' ? ' | ' + seatText(s) : ''}
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
      <div className="sec-head"><h2>Virtual theater: now showing</h2><a className="more" href="/cinema">Full showtimes</a></div>
      <div className="show-grid">{items.map((s) => <ShowingCard key={s.id} s={s} />)}</div>
    </section>
  )
}

// ---------------------------------------------------------------- the marquee
export function CinemaPage() {
  useSeo({ title: 'Virtual Theater: Now Showing and Showtimes', description: 'The Festaview virtual theater. See what is playing on every screen and the showtimes, then watch together with everyone, from anywhere.' })
  const c = useCinema()
  const today = dayKey(new Date().toISOString())
  const [day, setDay] = useState(today)
  if (!c) return <section className="block"><h1>Virtual theater</h1><p className="note">Loading showtimes...</p></section>

  const live = c.showings.filter((s) => { const k = showState(s).key; return k === 'playing' || k === 'lobby' || k === 'qa' })
  const days = [...new Set([today, ...c.showings.map((s) => dayKey(s.starts_at))])].sort().slice(0, 8)
  const onDay = c.showings.filter((s) => dayKey(s.starts_at) === day && showState(s).key !== 'ended')
  const screens = c.screens.filter((sc) => onDay.some((s) => s.screen_id === sc.id))

  return (
    <section className="block marquee">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Virtual theater</span></nav>
      <h1>Virtual theater</h1>
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
    'DTSTART:' + icsStamp(s.starts_at), 'DTEND:' + icsStamp(s.ends_at), 'SUMMARY:' + s.title.replace(/[,;]/g, ' ') + ' - Festaview virtual theater', 'URL:' + window.location.origin + cinemaPath(s), 'END:VEVENT', 'END:VCALENDAR']
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
  useSeo(s ? { title: s.title + ': Virtual Theater Showing', description: (s.description || 'Watch ' + s.title + ' in the Festaview virtual theater.') + ' ' + s.screen_name + '.', canonicalPath: cinemaPath(s), image: s.poster_url || undefined } : { title: c ? 'Showing not found' : 'Virtual theater', robots: c ? 'noindex' : 'index,follow' })
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

  if (inRoom) {
    return (
      <section className="block room">
        <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/cinema">Virtual theater</a> / <span>{s.title}</span></nav>
        <Suspense fallback={<p className="note">Opening the theater...</p>}><CinemaRoom showing={s} onLeave={() => setInRoom(false)} /></Suspense>
      </section>
    )
  }

  return (
    <article className="block film-page">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/cinema">Virtual theater</a> / <span>{s.title}</span></nav>
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
            <li>Doors open {s.lobby_minutes} minutes early</li>
          </ul>
          {st.key === 'ended' && <p className="note">This showing has ended. <a href="/cinema">See what is playing now</a>.</p>}
          {st.key !== 'ended' && (
            <div className="actions">
              {st.open && !sold && <button className="btn" onClick={() => setInRoom(true)}>{st.key === 'playing' ? 'Join now at ' + mmss(st.into) : st.key === 'qa' ? 'Join the conversation' : 'Enter the theater'}</button>}
              {!st.open && !sold && !reserved && <button className="btn" onClick={reserve}>Reserve a seat</button>}
              {!st.open && !sold && reserved && <span className="ok">Seat reserved. Come back when the doors open.</span>}
              {sold && <span className="btn disabled">Sold out</span>}
              {st.key !== 'ended' && <button className="btn ghost" onClick={() => downloadIcs(s)}>Add to calendar</button>}
            </div>
          )}
          {msg && <p className="error">{msg}</p>}
          <p className="note small">Everyone watches at the same time. If you arrive late, you join at the live point. Times are shown in your time zone{zoneName() ? ' (' + zoneName() + ')' : ''}.</p>
        </div>
      </div>
    </article>
  )
}
