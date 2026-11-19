import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { buildChannels, nowOn, schedule, clock } from './channels.js'
import { logView } from './data.js'

function attach(video, url, hlsRef, start) {
  if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
  const hls = /\.m3u8(\?|$)/i.test(url)
  if (hls && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
    const h = new Hls({ startPosition: start })
    h.loadSource(url)
    h.attachMedia(video)
    hlsRef.current = h
  } else {
    video.src = url
    const seek = () => { try { video.currentTime = start } catch { /* ignore */ } video.removeEventListener('loadedmetadata', seek) }
    video.addEventListener('loadedmetadata', seek)
  }
}

const timeLabel = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

// Plays a channel from where the clock says it should be, then moves on to the next film automatically.
export default function ChannelPlayer({ channelId, data }) {
  const ch = useMemo(() => buildChannels(data).find((c) => c.id === channelId), [data, channelId])
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const watched = useRef({ secs: 0, last: 0 })
  const [cur, setCur] = useState(() => (ch ? nowOn(ch) : null))
  const [, setTick] = useState(0)

  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 15000); return () => clearInterval(t) }, [])

  const flush = (film) => {
    const w = watched.current
    if (film && w.secs >= 1) logView({ film_id: film.id, festival_id: film.festival_id, seconds_watched: Math.min(21600, Math.round(w.secs)), source: 'channel' })
    w.secs = 0
  }

  const filmId = cur ? cur.item.film.id : null
  useEffect(() => {
    if (!cur) return undefined
    const v = videoRef.current
    watched.current = { secs: 0, last: 0 }
    attach(v, cur.item.film.video_url, hlsRef, cur.offset)
    v.play().catch(() => {})
    const film = cur.item.film
    const onTime = () => {
      const w = watched.current
      const d = v.currentTime - w.last
      if (d > 0 && d < 1.5) w.secs += d
      w.last = v.currentTime
    }
    v.addEventListener('timeupdate', onTime)
    return () => { v.removeEventListener('timeupdate', onTime); flush(film) }
  }, [filmId, cur && cur.index]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (hlsRef.current) hlsRef.current.destroy() }, [])

  if (!ch || !cur) {
    return <p className="note">This channel has nothing to play yet.</p>
  }

  const advance = () => {
    const n = nowOn(ch)
    if (n.item.film.id === cur.item.film.id && ch.items.length > 1) {
      const idx = (cur.index + 1) % ch.items.length
      setCur({ item: ch.items[idx], index: idx, offset: 0, remaining: ch.items[idx].duration, next: ch.items[(idx + 1) % ch.items.length] })
    } else if (n.item.film.id === cur.item.film.id) {
      setCur({ ...n, offset: 0 })
    } else {
      setCur(n)
    }
  }

  const upcoming = schedule(ch, 5).slice(1)
  const remaining = Math.max(0, cur.item.duration - (videoRef.current ? videoRef.current.currentTime : cur.offset))

  return (
    <div className="chan inline">
      <div>
        <video ref={videoRef} className="player" controls playsInline onEnded={advance} aria-label={ch.name} />
        <div className="chan-body">
          <p className="chan-meta"><span className="pill live">Live</span> Channel {ch.number} | {ch.name}</p>
          <h2 className="h3">Now playing: {cur.item.title}</h2>
          <p className="meta">{clock(remaining)} remaining{cur.next && ch.items.length > 1 ? '  |  Up next: ' + cur.next.title : ''}</p>
          {upcoming.length > 0 && ch.items.length > 1 && (
            <ul className="schedule chan-sched">
              {upcoming.map((p, i) => <li key={i}><span className="when">{timeLabel(p.start)}</span><strong>{p.item.title}</strong></li>)}
            </ul>
          )}
          <p className="note small">This channel plays on a schedule, so everyone watching sees the same film at the same time.</p>
        </div>
      </div>
    </div>
  )
}
