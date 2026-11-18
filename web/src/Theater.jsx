import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import * as api from './adminData.js'

const isMp4 = (u) => /\.mp4(\?|$)/i.test(u || '')
const isHls = (u) => /\.m3u8(\?|$)/i.test(u || '')
const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA')
const dayLabel = (key) => new Date(key + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const timeLabel = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

function attach(video, url, hlsRef) {
  if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
  if (isHls(url) && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
    const h = new Hls()
    h.loadSource(url)
    h.attachMedia(video)
    hlsRef.current = h
  } else {
    video.src = url
  }
}

// Theater Mode: runs a day's screenings in order, fullscreen, for a projector connected to a laptop or media box.
export default function Theater({ slug }) {
  const [session, setSession] = useState(undefined)
  const [festival, setFestival] = useState(null)
  const [films, setFilms] = useState([])
  const [venues, setVenues] = useState([])
  const [screenings, setScreenings] = useState([])
  const [err, setErr] = useState('')
  const [venueId, setVenueId] = useState('')
  const [day, setDay] = useState('')
  const [cache, setCache] = useState({})
  const [show, setShow] = useState({ phase: 'idle', idx: 0 })
  const [paused, setPaused] = useState(false)
  const [bar, setBar] = useState(true)
  const [attendance, setAttendance] = useState({})
  const [saved, setSaved] = useState(false)
  const rootRef = useRef(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const barTimer = useRef(null)

  useEffect(() => { api.getSession().then(setSession); return api.onAuth(setSession) }, [])

  useEffect(() => {
    if (!session) return
    ;(async () => {
      try {
        const list = await api.myFestivals()
        const f = list.find((x) => x.slug === slug) || list[0]
        if (!f) { setErr('Your account is not linked to a festival.'); return }
        setFestival(f)
        const [fl, vn, sc] = await Promise.all([api.listFilms(f.id), api.listVenues(f.id), api.listScreenings(f.id)])
        setFilms(fl); setVenues(vn); setScreenings(sc)
      } catch (e) { setErr(e.message) }
    })()
  }, [session, slug])

  const days = useMemo(() => [...new Set(screenings.map((s) => dayKey(s.starts_at)))].sort(), [screenings])
  useEffect(() => {
    if (day || !days.length) return
    const today = dayKey(new Date().toISOString())
    setDay(days.find((d) => d >= today) || days[0])
  }, [days, day])

  const playlist = useMemo(
    () => screenings
      .filter((s) => dayKey(s.starts_at) === day && (!venueId || s.venue_id === venueId))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .map((s) => ({ s, film: films.find((f) => f.id === s.film_id), venue: venues.find((v) => v.id === s.venue_id) })),
    [screenings, films, venues, day, venueId],
  )
  const playable = playlist.filter((p) => p.film && p.film.video_url)
  const current = show.phase !== 'idle' && show.phase !== 'done' ? playable[show.idx] : null

  // card -> playing, gap -> next
  useEffect(() => {
    if (show.phase === 'card') {
      const t = setTimeout(() => setShow((s) => ({ ...s, phase: 'playing' })), 6000)
      return () => clearTimeout(t)
    }
    if (show.phase === 'gap') {
      const t = setTimeout(() => setShow((s) => (s.idx + 1 < playable.length ? { idx: s.idx + 1, phase: 'card' } : { idx: s.idx, phase: 'done' })), 5000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [show.phase, show.idx, playable.length])

  useEffect(() => {
    if (show.phase !== 'playing' || !current) return
    const v = videoRef.current
    const c = cache[current.film.id]
    attach(v, (c && c.blobUrl) || current.film.video_url, hlsRef)
    setPaused(false)
    v.play().catch(() => setErr('Playback needs a click. Press Resume.'))
  }, [show.phase, show.idx]) // eslint-disable-line react-hooks/exhaustive-deps

  const wake = () => {
    setBar(true)
    clearTimeout(barTimer.current)
    barTimer.current = setTimeout(() => setBar(false), 3000)
  }
  const fullscreen = () => {
    const el = rootRef.current
    if (document.fullscreenElement) document.exitFullscreen()
    else if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {})
  }
  const stop = () => {
    const v = videoRef.current
    if (v) v.pause()
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    setShow({ phase: 'idle', idx: 0 })
    if (document.fullscreenElement) document.exitFullscreen()
  }
  const toggle = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPaused(false) } else { v.pause(); setPaused(true) }
    setErr('')
  }
  const skip = () => {
    if (videoRef.current) videoRef.current.pause()
    setShow((s) => (s.idx + 1 < playable.length ? { idx: s.idx + 1, phase: 'card' } : { idx: s.idx, phase: 'done' }))
  }
  const start = () => {
    if (!playable.length) { setErr('Nothing playable. Each screening needs a film with a video link.'); return }
    setErr(''); setSaved(false)
    setShow({ idx: 0, phase: 'card' })
    fullscreen()
    wake()
  }

  useEffect(() => {
    const on = (e) => {
      if (show.phase === 'idle' || show.phase === 'done') return
      if (e.code === 'Space') { e.preventDefault(); toggle() }
      if (e.key === 'f' || e.key === 'F') fullscreen()
      if (e.key === 'ArrowRight') skip()
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  const preload = async (film) => {
    setCache((c) => ({ ...c, [film.id]: { state: 'loading', pct: 0 } }))
    try {
      const res = await fetch(film.video_url)
      if (!res.ok) throw new Error('bad response')
      const total = Number(res.headers.get('content-length')) || 0
      const reader = res.body.getReader()
      const chunks = []
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); got += value.length
        if (total) setCache((c) => ({ ...c, [film.id]: { state: 'loading', pct: Math.round((got / total) * 100) } }))
      }
      setCache((c) => ({ ...c, [film.id]: { state: 'ready', blobUrl: URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' })) } }))
    } catch {
      setCache((c) => ({ ...c, [film.id]: { state: 'error' } }))
    }
  }

  const saveLogs = async () => {
    try {
      for (const p of playable) {
        const n = attendance[p.s.id]
        if (n !== undefined && n !== '') await api.saveLog(festival.id, { screening_id: p.s.id, attendance: parseInt(n, 10) || 0 })
      }
      setSaved(true)
    } catch (e) { setErr(e.message) }
  }

  if (session === undefined) return <p className="note pad">Loading...</p>
  if (!session) return <p className="note pad">Sign in first at <a href="#/admin">the festival login</a>, then open Theater Mode again.</p>
  if (!festival) return <p className="note pad">{err || 'Loading...'}</p>

  const stage = show.phase === 'card' || show.phase === 'playing' || show.phase === 'gap'

  return (
    <div ref={rootRef} className={'theater' + (stage ? ' running' : '')} onMouseMove={stage ? wake : undefined}>
      {stage && (
        <div className="stage">
          <video ref={videoRef} className={'stage-video' + (show.phase === 'playing' ? '' : ' hidden')} playsInline onEnded={() => setShow((s) => ({ ...s, phase: 'gap' }))} />
          {show.phase === 'card' && current && (
            <div className="card-screen">
              <p className="eyebrow">{festival.name}</p>
              <h1>{current.film.title}</h1>
              <p>{[current.film.director && 'Directed by ' + current.film.director, current.film.runtime_min && current.film.runtime_min + ' min', current.film.rating].filter(Boolean).join('   |   ')}</p>
              <p className="note">{[current.venue && current.venue.name, current.s.room].filter(Boolean).join('   |   ')}</p>
            </div>
          )}
          {show.phase === 'gap' && <div className="card-screen" />}
          <div className={'stage-bar' + (bar ? ' on' : '')}>
            <span>{current ? current.film.title : ''} ({show.idx + 1} of {playable.length})</span>
            <button className="btn ghost" onClick={toggle}>{paused ? 'Resume' : 'Pause'}</button>
            <button className="btn ghost" onClick={skip}>Skip</button>
            <button className="btn ghost" onClick={fullscreen}>Fullscreen</button>
            <button className="btn ghost danger" onClick={stop}>Stop show</button>
          </div>
          {err && <p className="stage-err">{err}</p>}
        </div>
      )}

      {!stage && (
        <div className="wrap-admin">
          <a className="back" href="#/admin">Back to festival admin</a>
          <div className="admin-head"><h1>Theater Mode</h1><span className="pill draft">{festival.name}</span></div>

          {show.phase === 'done' ? (
            <div className="panel">
              <h2>Show finished</h2>
              <p className="note">Record attendance for each screening (optional). This feeds your reporting.</p>
              <ul className="list">
                {playable.map((p) => (
                  <li key={p.s.id}>
                    <div><strong>{p.s.title || p.film.title}</strong><small>{timeLabel(p.s.starts_at)}</small></div>
                    <input className="att" placeholder="Attendance" inputMode="numeric" value={attendance[p.s.id] ?? ''} onChange={(e) => setAttendance({ ...attendance, [p.s.id]: e.target.value })} />
                  </li>
                ))}
              </ul>
              {err && <p className="error">{err}</p>}
              {saved && <p className="ok">Saved.</p>}
              <div className="actions">
                <button className="btn" onClick={saveLogs}>Save attendance</button>
                <button className="btn ghost" onClick={() => setShow({ phase: 'idle', idx: 0 })}>Back to schedule</button>
              </div>
            </div>
          ) : (
            <>
              <div className="panel">
                <div className="inline-form">
                  <select value={day} onChange={(e) => setDay(e.target.value)}>
                    {days.length === 0 && <option value="">No screenings</option>}
                    {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                  </select>
                  <select value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                    <option value="">All venues</option>
                    {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                  <button className="btn" onClick={start} disabled={!playable.length}>Start show</button>
                </div>
                {err && <p className="error">{err}</p>}
                <ul className="list">
                  {playlist.length === 0 && <li><span className="note">No screenings for this day. Add them under the Theaters tab.</span></li>}
                  {playlist.map((p) => {
                    const c = p.film ? cache[p.film.id] : null
                    const ok = p.film && p.film.video_url
                    return (
                      <li key={p.s.id}>
                        <div>
                          <strong>{timeLabel(p.s.starts_at)}  {p.s.title || (p.film && p.film.title) || 'Untitled'}</strong>
                          <small>{[p.venue && p.venue.name, p.s.room, p.film && p.film.runtime_min && p.film.runtime_min + ' min'].filter(Boolean).join(' | ')}</small>
                        </div>
                        {!ok && <span className="pill draft">No video link</span>}
                        {ok && c && c.state === 'ready' && <span className="pill published">Preloaded</span>}
                        {ok && c && c.state === 'loading' && <span className="pill">Loading {c.pct}%</span>}
                        {ok && c && c.state === 'error' && <span className="pill live">Preload failed</span>}
                        {ok && isMp4(p.film.video_url) && (!c || c.state === 'error') && <button className="btn ghost" onClick={() => preload(p.film)}>Preload</button>}
                      </li>
                    )
                  })}
                </ul>
              </div>
              <div className="panel">
                <h2>Before doors open</h2>
                <ul className="ticks">
                  <li>Connect the laptop or media box to the projector and set the display to the room's native resolution.</li>
                  <li>Use a wired internet connection, or Preload MP4 films so playback does not depend on the venue's network.</li>
                  <li>Run a short test playback with sound through the cinema speakers, then press Start show.</li>
                  <li>Keys during the show: Space to pause, F for fullscreen, Right arrow to skip.</li>
                  <li>For cinema servers that need a DCP, use the Package button on the Theaters tab and send the venue its DCP link instead.</li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
