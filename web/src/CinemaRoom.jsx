import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { cinemaJoin, cinemaListChat, cinemaPostChat, logView } from './data.js'
import { ChatPanel } from './VirtualRoom.jsx'

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
  }, [ok, phaseKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const text = { full: 'This showing is sold out.', ended: 'This showing has ended.', not_found: 'This showing is not available.' }[state.status] || 'Something went wrong. Please try again.'
    return <div className="access"><h2 className="h3">{text}</h2><p><button className="btn ghost" onClick={onLeave}>Back to the showing</button></p></div>
  }

  const current = view.phase === 'playing' ? timeline[view.idx] : null
  const next = view.phase === 'playing' ? timeline[view.idx + 1] : null
  const late = view.phase === 'playing' && view.into > 20

  return (
    <div className={'room-grid' + (info.chat_enabled ? ' with-chat' : '')}>
      <div>
        <div className="screen-stage" ref={stageRef}>
          <video ref={videoRef} className="player" playsInline />
          {view.phase === 'lobby' && !info.preroll_url && (
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
            <button type="button" className="btn ghost small" onClick={() => setMuted(!muted)}>{muted ? 'Unmute' : 'Mute'}</button>
            <button type="button" className="btn ghost small" onClick={fullscreen}>Fullscreen</button>
            <button type="button" className="btn ghost small" onClick={onLeave}>Leave</button>
          </span>
        </div>
        <h1 className="room-title">{info.title}</h1>
        <p className="note small">Showtime {fmtTime(info.starts_at)}. Everyone is watching at the same point, so there is no pause or rewind.</p>
      </div>
      {info.chat_enabled && <ChatPanel ev={{ id: showing.id }} code="" loader={cinemaListChat} poster={(name, text, kind) => cinemaPostChat(showing.id, name, text, kind)} />}
    </div>
  )
}
