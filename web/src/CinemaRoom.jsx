import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { cinemaJoin, cinemaListChat, cinemaPostChat, logView } from './data.js'
import { ChatPanel } from './VirtualRoom.jsx'
import { loadCast, watchCast, requestCast, endCast, castLoad, castPosition, castSeek } from './cast.js'

const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
const mmss = (sec) => { const s = Math.max(0, Math.round(sec)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') }

function attach(video, url, hlsRef, start) {
  if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
  const hls = /\.m3u8(\?|$)/i.test(url)
  if (hls && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
    const h = new Hls(start ? { startPosition: start } : {})
    h.loadSource(url)
    h.attachMedia(video)
    hlsRef.current = h
  } else {
    video.src = url
    if (start) {
      const seek = () => { try { video.currentTime = start } catch { /* ignore */ } video.removeEventListener('loadedmetadata', seek) }
      video.addEventListener('loadedmetadata', seek)
    }
  }
}

// The theater room. Everyone is on the server's clock, so the film starts at the same moment for all viewers,
// and a viewer who arrives late joins at the live point.
export default function CinemaRoom({ showing, onLeave }) {
  const [state, setState] = useState({ status: 'joining' })
  const [muted, setMuted] = useState(false)
  const [, setTick] = useState(0)
  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const hlsRef = useRef(null)
  const viewRef = useRef(null)
  const [cast, setCast] = useState({ available: false, on: false, name: '' })
  const [castMsg, setCastMsg] = useState('')
  const castOnRef = useRef(false)
  castOnRef.current = cast.on
  const airplay = typeof window !== 'undefined' && !!window.WebKitPlaybackTargetAvailabilityEvent

  // Chromecast: load the Cast sender once and follow the session.
  useEffect(() => {
    let off = null, stop = false
    loadCast().then((ok) => {
      if (stop || !ok) return
      setCast((c) => ({ ...c, available: true }))
      try { off = watchCast((st) => setCast((c) => ({ ...c, on: st.on, name: st.name }))) } catch { /* ignore */ }
    })
    return () => { stop = true; if (off) off() }
  }, [])

  useEffect(() => {
    let stop = false
    cinemaJoin(showing.id).then((r) => {
      if (stop) return
      if (r.status === 'ok') setState({ status: 'ok', info: r, skew: r.server_now - Date.now() })
      else setState({ status: r.status, info: r })
    })
    return () => { stop = true }
  }, [showing.id])

  const info = state.info
  const ok = state.status === 'ok'
  const timeline = useMemo(() => {
    if (!ok) return []
    if (info.kind === 'live') return [{ kind: 'live', title: info.title, url: info.live_stream_url, dur: info.runtime_min * 60 }]
    return (info.films || []).filter((f) => f.video_url).map((f) => ({ kind: 'film', title: f.title, url: f.video_url, dur: Number(f.duration_sec) || 0, film: f }))
  }, [ok, info])
  const total = timeline.reduce((a, i) => a + i.dur, 0)
  const startMs = ok ? Date.parse(info.starts_at) : 0
  const endMs = ok ? Date.parse(info.ends_at) : 0
  const nowMs = () => Date.now() + (state.skew || 0)

  // Where the clock says the room is right now.
  const where = () => {
    const n = nowMs()
    if (n < startMs) return { phase: 'lobby', left: Math.ceil((startMs - n) / 1000) }
    const pos = (n - startMs) / 1000
    if (pos < total) {
      let acc = 0
      for (let i = 0; i < timeline.length; i++) {
        if (pos < acc + timeline[i].dur) return { phase: 'playing', idx: i, offset: pos - acc, into: Math.floor(pos) }
        acc += timeline[i].dur
      }
    }
    if (n < endMs) return { phase: 'after', left: Math.ceil((endMs - n) / 1000) }
    return { phase: 'ended' }
  }
  const view = ok ? where() : null
  viewRef.current = view

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 500); return () => clearInterval(t) }, [])

  // Start, switch or stop the picture when the room changes phase (lobby, a film, the Q&A).
  const phaseKey = view ? view.phase + ':' + (view.idx != null ? view.idx : '') : ''
  useEffect(() => {
    if (!ok || !view) return undefined
    const v = videoRef.current
    if (!v) return undefined
    if (castOnRef.current) { v.pause(); return undefined }
    let watched = { secs: 0, last: 0 }
    let item = null
    let onTime = null
    if (view.phase === 'playing') {
      item = timeline[view.idx]
      attach(v, item.url, hlsRef, item.kind === 'live' ? 0 : Math.max(0, Math.floor(view.offset)))
      v.loop = false
      v.play().catch(() => {})
      onTime = () => { const d = v.currentTime - watched.last; if (d > 0 && d < 1.5) watched.secs += d; watched.last = v.currentTime }
      v.addEventListener('timeupdate', onTime)
    } else if (view.phase === 'lobby' && info.preroll_url) {
      attach(v, info.preroll_url, hlsRef, 0)
      v.loop = true
      v.play().catch(() => {})
    } else {
      v.pause()
    }
    return () => {
      if (onTime) v.removeEventListener('timeupdate', onTime)
      if (item && watched.secs >= 1) {
        logView({ ...(item.film ? { film_id: item.film.id } : {}), festival_id: info.festival_id, seconds_watched: Math.min(21600, Math.round(watched.secs)), source: 'theater' })
      }
    }
  }, [ok, phaseKey, cast.on]) // eslint-disable-line react-hooks/exhaustive-deps

  // While casting, the TV plays the room: send it the film at the live point, and the next films queued behind it.
  // If the cast starts before showtime, the TV is sent the film when the doors close and the film begins.
  useEffect(() => {
    if (!ok || !cast.on) return undefined
    let timer = null
    const send = () => {
      const w = viewRef.current
      if (!w || w.phase !== 'playing') return
      const items = timeline.slice(w.idx)
      castLoad(items, items[0] && items[0].kind === 'live' ? 0 : w.offset)
    }
    const w0 = viewRef.current
    if (w0 && w0.phase === 'lobby') timer = setTimeout(send, Math.max(0, startMs - nowMs()) + 400)
    else if (w0 && w0.phase === 'playing') send()
    // Keep the TV in step too: if it drifts, move it to where the room is.
    const drift = setInterval(() => {
      const w = viewRef.current
      if (!w || w.phase !== 'playing' || !timeline[w.idx] || timeline[w.idx].kind === 'live') return
      const pos = castPosition()
      if (pos != null && Math.abs(pos - w.offset) > 6) castSeek(w.offset)
    }, 20000)
    return () => { if (timer) clearTimeout(timer); clearInterval(drift) }
  }, [ok, cast.on]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCast = () => {
    setCastMsg('')
    if (cast.on) { endCast(); return }
    requestCast().catch((e) => {
      const code = String((e && (e.code || e)) || '')
      if (code === 'cancel') return
      setCastMsg(code === 'receiver_unavailable'
        ? 'No TV was found. Your computer and the TV must be on the same Wi-Fi, and the TV must support Chromecast (Chromecast, Google TV, Android TV and many Vizio, Sony, Philips and TCL models). Roku players and TVs do not support Chromecast.'
        : 'Casting did not start (' + (code || 'unknown reason') + '). Try again, or use the Chrome menu: Cast, save and share, then Cast.')
    })
  }
  const showAirplay = () => { const v = videoRef.current; if (v && v.webkitShowPlaybackTargetPicker) v.webkitShowPlaybackTargetPicker() }

  // Keep everyone in step: if this viewer drifts more than a few seconds, move to where the room should be.
  useEffect(() => {
    const t = setInterval(() => {
      const w = viewRef.current
      const v = videoRef.current
      if (w && v && w.phase === 'playing' && timeline[w.idx] && timeline[w.idx].kind !== 'live' && !v.paused && Math.abs(v.currentTime - w.offset) > 4) {
        try { v.currentTime = w.offset } catch { /* ignore */ }
      }
    }, 8000)
    return () => clearInterval(t)
  }, [timeline])

  useEffect(() => () => { if (hlsRef.current) hlsRef.current.destroy() }, [])
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted }, [muted, phaseKey])

  const fullscreen = () => {
    const el = stageRef.current
    if (document.fullscreenElement) document.exitFullscreen()
    else if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {})
  }

  if (state.status === 'joining') return <p className="note">Finding your seat...</p>
  if (state.status === 'too_early') {
    return (
      <div className="access">
        <h2 className="h3">The doors are not open yet</h2>
        <p className="note">The theater opens at {fmtTime(info.opens_at)} and the film starts at {fmtTime(info.starts_at)}.</p>
        <p><button className="btn ghost" onClick={onLeave}>Back to the showing</button></p>
      </div>
    )
  }
  if (state.status !== 'ok') {
    const text = { ticket_required: 'This showing needs a ticket. Go back to the showing page to buy one or enter your ticket code.', full: 'This showing is sold out.', ended: 'This showing has ended.', not_found: 'This showing is not available.' }[state.status] || 'Something went wrong. Please try again.'
    return <div className="access"><h2 className="h3">{text}</h2><p><button className="btn ghost" onClick={onLeave}>Back to the showing</button></p></div>
  }

  const current = view.phase === 'playing' ? timeline[view.idx] : null
  const next = view.phase === 'playing' ? timeline[view.idx + 1] : null
  const late = view.phase === 'playing' && view.into > 20

  return (
    <div className={'room-grid' + (info.chat_enabled ? ' with-chat' : '')}>
      <div>
        <div className="screen-stage" ref={stageRef}>
          <video ref={videoRef} className="player" playsInline x-webkit-airplay="allow" />
          {cast.on && (
            <div className="lobby-card">
              <p className="eyebrow">Casting</p>
              <h2>{cast.name ? 'Playing on ' + cast.name : 'Playing on your TV'}</h2>
              <p className="note">{view.phase === 'lobby' ? 'The film will start on your TV at showtime.' : 'Your TV is playing the room. Chat stays here on this device.'}</p>
            </div>
          )}
          {view.phase === 'lobby' && !info.preroll_url && !cast.on && (
            <div className="lobby-card">
              <p className="eyebrow">The doors are open</p>
              <h2>{info.title}</h2>
              <p className="count">Starts in {mmss(view.left)}</p>
              <p className="note">Find your seat. The film starts at {fmtTime(info.starts_at)} for everyone.</p>
            </div>
          )}
          {view.phase === 'lobby' && info.preroll_url && <div className="lobby-tag">Starts in {mmss(view.left)}{info.sponsor_name ? ' | ' + info.sponsor_name : ''}</div>}
          {view.phase === 'after' && (
            <div className="lobby-card">
              <p className="eyebrow">Thanks for watching</p>
              <h2>Q&amp;A and conversation</h2>
              <p className="note">Keep the conversation going in chat. The theater closes in {mmss(view.left)}.</p>
            </div>
          )}
          {view.phase === 'ended' && (
            <div className="lobby-card">
              <h2>This showing has ended</h2>
              <p><a className="btn" href="/cinema">See what is playing now</a></p>
            </div>
          )}
        </div>
        <div className="room-bar">
          <span>{showing.screen_name}{current ? ' | ' + current.title : ''}</span>
          {view.phase === 'playing' && <span className="pill live">{late ? 'Joined late, live at ' + mmss(view.into) : 'Now showing'}</span>}
          {next && <small>Up next: {next.title}</small>}
          <span className="room-actions">
            {cast.available && <button type="button" className="btn ghost small" onClick={toggleCast}>{cast.on ? 'Stop casting' : 'Cast to TV'}</button>}
            {airplay && !cast.on && <button type="button" className="btn ghost small" onClick={showAirplay}>AirPlay</button>}
            <button type="button" className="btn ghost small" onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" className="btn ghost small" onClick={fullscreen}>Fullscreen</button>
            <button type="button" className="btn ghost small" onClick={onLeave}>Leave</button>
          </span>
        </div>
        {castMsg && <p className="error" role="alert">{castMsg}</p>}
        <h1 className="room-title">{info.title}</h1>
        <p className="note small">Showtime {fmtTime(info.starts_at)}. Everyone is watching at the same point, so there is no pause or rewind. To watch on a TV, use Cast to TV (Chrome) or AirPlay (Safari), or open this page in your smart TV's browser.</p>
      </div>
      {info.chat_enabled && <ChatPanel ev={{ id: showing.id }} code="" loader={cinemaListChat} poster={(name, text, kind) => cinemaPostChat(showing.id, name, text, kind)} />}
    </div>
  )
}
