// The theater pre-show: ads and trailers after the doors open, then a "silence your phone" reminder, then the feature.
// Pure timing rules (no network) so the room, the tests and the demo all agree.

export const PHONE_SEC = 30 // the last 30 seconds before showtime are the phone reminder and the feature card
export const FEATURE_SEC = 5 // of which the last 5 seconds say "Feature presentation"

// Where the room is before showtime. Everyone shares the server clock, so everyone sees the same reel at the same moment.
//   { phase: 'ad', idx, offset, item }   an ad or trailer is playing (offset = seconds into it)
//   { phase: 'gap', left }               the reel is over and the film has not started (intermission)
//   { phase: 'phone', left }             "please silence your mobile phone"
//   { phase: 'feature', left }           "feature presentation"
// Returns null once the film has started.
export function preshowWhere(plan, lobbyOpenMs, startMs, nowMs) {
  if (nowMs >= startMs) return null
  const left = Math.ceil((startMs - nowMs) / 1000)
  if (left <= FEATURE_SEC) return { phase: 'feature', left }
  if (left <= PHONE_SEC) return { phase: 'phone', left }
  const pos = (nowMs - lobbyOpenMs) / 1000
  let acc = 0
  const items = plan || []
  for (let i = 0; i < items.length; i++) {
    const d = Number(items[i].dur) || 0
    if (pos >= acc && pos < acc + d) return { phase: 'ad', idx: i, offset: pos - acc, item: items[i] }
    acc += d
  }
  return { phase: 'gap', left }
}

export const reelSeconds = (plan) => (plan || []).reduce((a, i) => a + (Number(i.dur) || 0), 0)
export const adLabel = (item) => (item && item.kind === 'trailer' ? 'Coming attractions' : 'Advertisement')
