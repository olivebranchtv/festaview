// Cast the theater room to a TV with Chromecast (Chrome and Edge). The Google Cast sender script is loaded only when
// a viewer opens a theater room. AirPlay (Safari, iPhone, iPad) is handled by the video element itself.
let sdk = null

export function loadCast() {
  if (sdk) return sdk
  sdk = new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(false); return }
    const done = (ok) => resolve(!!ok)
    window.__onGCastApiAvailable = (ok) => {
      if (!ok) { done(false); return }
      try {
        const ctx = window.cast.framework.CastContext.getInstance()
        ctx.setOptions({ receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID, autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED })
        done(true)
      } catch { done(false) }
    }
    const s = document.createElement('script')
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
    s.async = true
    s.onerror = () => done(false)
    document.head.appendChild(s)
    setTimeout(() => done(false), 8000)
  })
  return sdk
}

const ctx = () => window.cast.framework.CastContext.getInstance()
export const castSession = () => { try { return ctx().getCurrentSession() } catch { return null } }

// Calls back with { on, name } whenever a cast session starts, resumes or ends.
export function watchCast(cb) {
  const T = window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED
  const S = window.cast.framework.SessionState
  const handler = (e) => {
    const s = castSession()
    const on = e.sessionState === S.SESSION_STARTED || e.sessionState === S.SESSION_RESUMED
    cb({ on, name: on && s && s.getCastDevice ? s.getCastDevice().friendlyName : '' })
  }
  ctx().addEventListener(T, handler)
  const s = castSession()
  if (s) cb({ on: true, name: s.getCastDevice ? s.getCastDevice().friendlyName : '' })
  return () => ctx().removeEventListener(T, handler)
}

export const requestCast = () => ctx().requestSession()
export const endCast = () => { try { ctx().endCurrentSession(true) } catch { /* ignore */ } }

const mime = (url) => (/\.m3u8(\?|$)/i.test(url) ? 'application/x-mpegurl' : /\.mp4(\?|$)/i.test(url) ? 'video/mp4' : 'application/x-mpegurl')

// Sends the films (in order) to the TV, starting offsetSec into the first one. A live stream has no offset.
export function castLoad(items, offsetSec) {
  const session = castSession()
  if (!session || !items.length) return Promise.resolve(false)
  const media = window.chrome.cast.media
  const queue = items.map((it, i) => {
    const info = new media.MediaInfo(it.url, mime(it.url))
    info.streamType = it.kind === 'live' ? media.StreamType.LIVE : media.StreamType.BUFFERED
    const md = new media.GenericMediaMetadata()
    md.title = it.title
    info.metadata = md
    const qi = new media.QueueItem(info)
    qi.autoplay = true
    qi.preloadTime = 20
    if (i === 0 && it.kind !== 'live' && offsetSec > 0) qi.startTime = offsetSec
    return qi
  })
  const req = new media.QueueLoadRequest(queue)
  req.startIndex = 0
  req.repeatMode = media.RepeatMode.OFF
  return new Promise((resolve) => {
    try { session.getSessionObj().queueLoad(req, () => resolve(true), () => resolve(false)) } catch { resolve(false) }
  })
}

// How far the TV is from where the room should be, in seconds (null when unknown). Seeks the TV when told to.
export function castPosition() {
  const s = castSession()
  const m = s && s.getSessionObj && s.getSessionObj().media && s.getSessionObj().media[0]
  return m && m.getEstimatedTime ? m.getEstimatedTime() : null
}
export function castSeek(sec) {
  const s = castSession()
  const m = s && s.getSessionObj && s.getSessionObj().media && s.getSessionObj().media[0]
  if (!m) return
  try {
    const r = new window.chrome.cast.media.SeekRequest()
    r.currentTime = sec
    m.seek(r, () => {}, () => {})
  } catch { /* ignore */ }
}
