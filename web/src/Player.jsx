import { useEffect, useRef } from 'react'
import Hls from 'hls.js'
import { logView } from './data.js'

// Plays HLS (via hls.js where the browser lacks native HLS) or MP4, and records watch time for analytics.
export default function Player({ film, track = true }) {
  const ref = useRef(null)

  useEffect(() => {
    const v = ref.current
    if (!v || !film.video_url) return undefined
    let hls
    const isHls = /\.m3u8(\?|$)/i.test(film.video_url)
    if (isHls && !v.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(film.video_url)
      hls.attachMedia(v)
    } else {
      v.src = film.video_url
    }

    let watched = 0
    let lastT = 0
    const onTime = () => {
      const d = v.currentTime - lastT
      if (d > 0 && d < 1.5) watched += d
      lastT = v.currentTime
    }
    const onSeek = () => { lastT = v.currentTime }
    const flush = () => {
      if (track && watched >= 1) {
        logView({ film_id: film.id, festival_id: film.festival_id, seconds_watched: Math.min(21600, Math.round(watched)) })
        watched = 0
      }
    }
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('seeking', onSeek)
    v.addEventListener('pause', flush)
    v.addEventListener('ended', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      flush()
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('seeking', onSeek)
      v.removeEventListener('pause', flush)
      v.removeEventListener('ended', flush)
      window.removeEventListener('pagehide', flush)
      if (hls) hls.destroy()
    }
  }, [film.id, film.video_url, film.festival_id])

  return (
    <video
      ref={ref}
      className="player"
      controls
      playsInline
      preload="metadata"
      poster={film.poster_url || undefined}
      crossOrigin={film.captions_url ? 'anonymous' : undefined}
    >
      {film.captions_url && <track kind="captions" src={film.captions_url} srcLang="en" label="Captions" default />}
    </video>
  )
}
