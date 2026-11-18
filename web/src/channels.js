// Automatic festival channels. Like a TV channel: films play back to back on a wall-clock schedule, so everyone
// who tunes in sees the same film at the same moment. No live equipment needed.

export const durationOf = (f) => {
  if (Number(f.duration_sec) > 0) return Number(f.duration_sec)
  if (Number(f.runtime_min) > 0) return Number(f.runtime_min) * 60
  return 0
}

// Deterministic shuffle: a simple hash that the Roku app reproduces exactly, so every device agrees on the order.
function hashKey(str) {
  let h = 7
  for (let i = 0; i < str.length; i++) h = (h * 131 + str.charCodeAt(i)) % 1000003
  return h
}

function shuffle(list, seed) {
  return list
    .map((f, i) => ({ f, k: hashKey(seed + ":" + f.id) * 1000 + i }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.f)
}

function arrange(films, order, seed) {
  const oldestFirst = films.slice().sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
  if (order === 'newest') return oldestFirst.reverse()
  if (order === 'shuffle') return shuffle(oldestFirst, seed)
  return oldestFirst
}

const playable = (f) => !!f.video_url && durationOf(f) > 0

function make(id, number, name, films, order, extra) {
  const items = arrange(films.filter(playable), order, id).map((f) => ({ film: f, title: f.title, duration: durationOf(f) }))
  if (!items.length) return null
  return { id, number, name, items, cycle: items.reduce((a, i) => a + i.duration, 0), ...extra }
}

// Channels available on the site: one per festival that switched its channel on, plus a Festaview Mix of them all.
export function buildChannels(data) {
  const fests = (data.festivals || []).filter((f) => f.auto_channel)
  const out = []
  const mixFilms = (data.films || []).filter((m) => fests.some((f) => f.id === m.festival_id))
  const mix = make('mix', 1, 'Festaview Mix', mixFilms, 'shuffle', { festivalId: null, color: '#E6B34A', description: 'Films from every festival, all day.' })
  if (mix) out.push(mix)
  fests.forEach((f, i) => {
    const ch = make('fest-' + f.id, 2 + i, f.name + ' Channel', (data.films || []).filter((m) => m.festival_id === f.id), f.channel_order || 'listed', {
      festivalId: f.id, festivalSlug: f.slug, color: f.brand_color || '#E6B34A', description: f.tagline || '',
    })
    if (ch) out.push(ch)
  })
  return out
}

// What is playing right now, how far in, and what is next.
export function nowOn(ch, nowMs = Date.now()) {
  const t = (nowMs / 1000) % ch.cycle
  let acc = 0
  for (let i = 0; i < ch.items.length; i++) {
    const it = ch.items[i]
    if (t < acc + it.duration) {
      return { item: it, index: i, offset: t - acc, remaining: acc + it.duration - t, next: ch.items[(i + 1) % ch.items.length] }
    }
    acc += it.duration
  }
  return { item: ch.items[0], index: 0, offset: 0, remaining: ch.items[0].duration, next: ch.items[1 % ch.items.length] }
}

// The next few programs with their start times, for the guide.
export function schedule(ch, count = 5, nowMs = Date.now()) {
  const n = nowOn(ch, nowMs)
  const out = []
  let start = nowMs - n.offset * 1000
  let i = n.index
  for (let k = 0; k < count; k++) {
    const item = ch.items[i % ch.items.length]
    out.push({ item, start })
    start += item.duration * 1000
    i++
  }
  return out
}

export function clock(sec) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? h + 'h ' + m + 'm' : m + ' min'
}
