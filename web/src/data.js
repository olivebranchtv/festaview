import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key) : null

const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString()

// Demo content shown until a Supabase project is connected.
const DEMO = {
  demo: true,
  festivals: [
    { id: 'f1', slug: 'harborlight', name: 'Harborlight Film Festival', tagline: 'Stories from the coast', brand_color: '#3FA7D6', voting_open: true, location: 'Portland, Oregon', starts_on: '2027-03-12', ends_on: '2027-03-16', passes_url: 'https://example.com/passes', description: 'Harborlight showcases independent stories from coastal communities around the world. Five days of features, shorts and documentaries, with live conversations and screenings across the city.' },
    { id: 'f2', slug: 'nightowl', name: 'Night Owl Horror Fest', tagline: 'Best watched after dark', brand_color: '#D64545' },
    { id: 'f3', slug: 'shortcut', name: 'Shortcut Shorts Festival', tagline: 'Big stories, small runtimes', brand_color: '#E6B34A' },
  ],
  films: [
    { id: 'm1', festival_id: 'f1', title: 'Salt and Rope', director: 'A. Moreno', runtime_min: 12, genre: 'Drama' },
    {
      id: 'm0', festival_id: 'f1', title: 'The Sparrows Nesting', director: '', runtime_min: 92,
      synopsis: 'Sample film for testing playback.',
      poster_url: 'https://vz-0bae8f18-f47.b-cdn.net/19a45b4e-db32-4c61-8d21-658bb69d9df4/thumbnail.jpg',
      video_url: 'https://vz-0bae8f18-f47.b-cdn.net/19a45b4e-db32-4c61-8d21-658bb69d9df4/playlist.m3u8',
      trailer_url: 'https://vz-0bae8f18-f47.b-cdn.net/60efa6ca-0209-4dc4-b309-e9f5488c0d4a/playlist.m3u8',
    },
    { id: 'm2', festival_id: 'f1', title: 'The Last Ferry', director: 'J. Okafor', runtime_min: 18, genre: 'Documentary' },
    { id: 'm3', festival_id: 'f2', title: 'Knock Twice', director: 'R. Lindqvist', runtime_min: 9, genre: 'Horror' },
    { id: 'm4', festival_id: 'f2', title: 'Basement Light', director: 'T. Nakamura', runtime_min: 14, genre: 'Horror' },
    { id: 'm5', festival_id: 'f3', title: 'Seven Minutes', director: 'S. Haddad', runtime_min: 7, genre: 'Comedy' },
    { id: 'm6', festival_id: 'f3', title: 'Paper Moon', director: 'L. Fischer', runtime_min: 5, genre: 'Animation' },
  ],
  feeds: [
    { id: 'l1', festival_id: 'f1', name: 'Harborlight Live', is_live: true },
    { id: 'l2', festival_id: 'f2', name: 'Night Owl Replay Channel', is_live: false, is_replay_loop: true },
  ],
  venues: [
    { id: 'v1', festival_id: 'f1', name: 'Lighthouse Cinema', city: 'Portland', address: '12 Harbor St' },
  ],
  screenings: [
    { id: 'sc1', festival_id: 'f1', venue_id: 'v1', film_id: 'm1', title: 'Salt and Rope', room: 'Screen 1', starts_at: inHours(72), ends_at: inHours(73), ticket_url: 'https://example.com/tickets' },
  ],
  schedule: [
    { id: 's1', live_feed_id: 'l1', film_id: 'm1', title: null, starts_at: inHours(2), ends_at: inHours(3) },
    { id: 's2', live_feed_id: 'l1', film_id: 'm2', title: 'Q&A with the director', starts_at: inHours(26), ends_at: inHours(27) },
    { id: 's3', live_feed_id: 'l2', film_id: 'm3', title: null, starts_at: inHours(5), ends_at: inHours(6) },
  ],
}

// Give demo films a playable video and a length so the demo channels have something to schedule.
const DEMO_TRAILER = 'https://vz-0bae8f18-f47.b-cdn.net/60efa6ca-0209-4dc4-b309-e9f5488c0d4a/playlist.m3u8'
DEMO.films.forEach((m) => { if (!m.video_url) { m.video_url = DEMO_TRAILER; m.duration_sec = 128 } else { m.duration_sec = 5518 } })
DEMO.festivals[0].auto_channel = true
DEMO.festivals[0].channel_order = 'listed'
DEMO.festivals[1].auto_channel = true
DEMO.festivals[1].channel_order = 'shuffle'
// One ticketed demo film (video link withheld, like the real public view) plus a pass and a ticket to sell.
const paperMoon = DEMO.films.find((m) => m.id === 'm6')
paperMoon.access = 'ticketed'
paperMoon.video_url = null
DEMO.festivals[2].payments_enabled = true
DEMO.festivals[2].description = 'Big stories in small runtimes. Free shorts all week, with ticketed premieres.'
const DEMO_CHAT = {}
const inH = (h) => new Date(Date.now() + h * 3600e3).toISOString()
DEMO.events = [
  { id: 'v1', festival_id: 'f1', kind: 'screening', title: 'Harborlight Opening Night', description: 'A premiere screening of our opening film, free to watch for 48 hours after you press play.', film_ids: ['m0'], preroll_url: DEMO_TRAILER, sponsor_name: 'Lighthouse Coffee', access: 'free', available_from: inH(-24), available_until: inH(72), watch_hours: 48, capacity: 500, geo_mode: 'none', geo_countries: [], chat_enabled: true, status: 'published' },
  { id: 'v2', festival_id: 'f2', kind: 'live', title: 'Night Owl Live: Q&A with the filmmakers', description: 'Join the live conversation. Chat and ask questions.', film_ids: [], live_stream_url: DEMO_TRAILER, access: 'free', starts_at: inH(-0.2), available_until: inH(5), geo_mode: 'none', geo_countries: [], chat_enabled: true, status: 'published' },
  { id: 'v4', festival_id: 'f1', kind: 'screening', title: 'Harborlight Closing Night Premiere', description: 'Opens in two days. Leave your email and we will tell you when it is ready.', film_ids: ['m1'], access: 'free', available_from: inH(48), available_until: inH(168), watch_hours: 72, geo_mode: 'none', geo_countries: [], chat_enabled: true, status: 'published' },
  { id: 'v3', festival_id: 'f3', kind: 'program', title: 'Shortcut Shorts Program A', description: 'Two award-nominated shorts in one ticketed program.', film_ids: ['m5', 'm6'], access: 'ticketed', available_from: inH(-2), available_until: inH(96), watch_hours: 24, geo_mode: 'allow', geo_countries: ['US', 'CA'], chat_enabled: true, status: 'published' },
]
DEMO_CHAT.v2 = [
  { id: 1, name: 'Maya', body: 'So excited for this one!', kind: 'chat', answered: false, created_at: inH(-0.1) },
  { id: 2, name: 'Jordan', body: 'How long did the shoot take?', kind: 'question', answered: false, created_at: inH(-0.08) },
]
DEMO.products = [
  { id: 'p1', festival_id: 'f3', film_id: null, name: 'Festival Pass', description: 'Every ticketed screening', price_cents: 2500, currency: 'usd' },
  { id: 'p2', festival_id: 'f3', film_id: 'm6', name: 'Paper Moon ticket', description: 'Single screening', price_cents: 500, currency: 'usd' },
]

// Flat queries merged in JS (PostgREST FK joins are unreliable on this stack).
export async function loadData() {
  if (!supabase) return DEMO
  // Films come from the public view, which hides the video link of ticketed films. Until the paid-access SQL has been
  // run the view does not exist, so fall back to the table.
  const filmsQuery = async () => {
    const v = await supabase.from('films_public').select('*').order('created_at', { ascending: false })
    if (!v.error) return v
    return supabase.from('films').select('*').eq('status', 'published').order('created_at', { ascending: false })
  }
  const [f, m, l, s, v, sc, pr, ve] = await Promise.all([
    supabase.from('festivals').select('*').eq('status', 'published').order('sort_order').order('name'),
    filmsQuery(),
    supabase.from('live_feeds').select('*'),
    supabase.from('schedule_items').select('*').gte('ends_at', new Date().toISOString()).order('starts_at').limit(200),
    // Venues and screenings are optional: if their tables are missing, the site still loads.
    supabase.from('venues').select('*'),
    supabase.from('screenings').select('*').gte('ends_at', new Date().toISOString()).order('starts_at').limit(300),
    supabase.from('products').select('*').eq('active', true).order('price_cents'),
    // Virtual events are optional: if their table is missing, the site still loads.
    supabase.from('virtual_events').select('*').order('starts_at', { ascending: true, nullsFirst: false }),
  ])
  if (f.error) throw f.error
  return { demo: false, festivals: f.data || [], films: m.data || [], feeds: l.data || [], schedule: s.data || [], venues: v.data || [], screenings: sc.data || [], products: pr.data || [], events: ve.data || [] }
}

// ---- virtual cinema ----
const VIRTUAL_FN = '/.netlify/functions/virtual-start'

// Starts or resumes a viewer's screening. Events with region rules go through the server function, which knows the
// viewer's real country. Other events ask the database directly.
export async function startVirtual(ev, code) {
  if (!supabase) return demoStart(ev, code)
  try {
    if (ev.geo_mode && ev.geo_mode !== 'none') {
      const res = await fetch(VIRTUAL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: ev.id, code: code || '', device: deviceId() }) })
      const j = await res.json().catch(() => null)
      return j && j.status ? j : { status: 'geo_check_required' }
    }
    const r = await supabase.rpc('virtual_start', { p_event: ev.id, p_code: code || '', p_device: deviceId(), p_country: null })
    return r.error || !r.data ? { status: 'error' } : r.data
  } catch { return { status: 'error' } }
}

export async function listChat(eventId) {
  if (!supabase) return DEMO_CHAT[eventId] || []
  const r = await supabase.from('chat_messages').select('id,name,body,kind,answered,created_at').eq('event_id', eventId).order('id', { ascending: false }).limit(60)
  return r.error ? [] : (r.data || []).reverse()
}

export async function postChat(ev, code, name, body, kind) {
  if (!supabase) {
    const list = (DEMO_CHAT[ev.id] = DEMO_CHAT[ev.id] || [])
    list.push({ id: Date.now(), name: name || 'Guest', body, kind, answered: false, created_at: new Date().toISOString() })
    return 'ok'
  }
  const r = await supabase.rpc('post_chat', { p_event: ev.id, p_code: code || '', p_device: deviceId(), p_name: name || '', p_body: body, p_kind: kind || 'chat' })
  return r.error ? 'error' : r.data
}

export async function reserveEvent(eventId, email) {
  if (!supabase) return { ok: true }
  const r = await supabase.from('virtual_reservations').insert({ event_id: eventId, email })
  return r.error ? { ok: false } : { ok: true }
}

// Demo behavior mirrors the database rules closely enough to try the screens.
function demoStart(ev, code) {
  const now = Date.now()
  if (ev.available_from && now < new Date(ev.available_from)) return { status: 'not_open', opens_at: ev.available_from }
  if (ev.available_until && now > new Date(ev.available_until)) return { status: 'closed' }
  if (ev.kind === 'live' && ev.starts_at && now < new Date(ev.starts_at) - 15 * 60000) return { status: 'not_started', starts_at: ev.starts_at }
  if (ev.access === 'ticketed' && !(code && code.trim().toUpperCase() === 'DEMO-PASS')) return { status: 'code_required' }
  const films = (ev.film_ids || []).map((id) => DEMO.films.find((m) => m.id === id)).filter(Boolean).map((m) => ({ ...m, video_url: m.video_url || DEMO_TRAILER }))
  return {
    status: 'ok', kind: ev.kind, title: ev.title, films, live_stream_url: ev.live_stream_url, preroll_url: ev.preroll_url, sponsor_name: ev.sponsor_name,
    first_play_at: new Date().toISOString(), watch_until: ev.watch_hours ? new Date(now + ev.watch_hours * 3600e3).toISOString() : null,
  }
}

// ---- paid access ----
// Asks the database for a film's video link. Free films always return it; ticketed films need a valid access code.
export async function unlockStream(filmId, code) {
  if (!supabase) return code && code.trim().toUpperCase() === 'DEMO-PASS' ? DEMO_TRAILER : null
  const r = await supabase.rpc('unlock_stream', { p_film: filmId, p_code: code || '' })
  return r.error ? null : r.data || null
}
export const storedCode = (festivalId) => { try { return localStorage.getItem('fv_code_' + festivalId) || '' } catch { return '' } }
export const storeCode = (festivalId, code) => { try { localStorage.setItem('fv_code_' + festivalId, code) } catch { /* ignore */ } }

// Starts a card payment. The server function builds the checkout from the product's price in the database.
export async function startCheckout(productId) {
  try {
    const res = await fetch('/.netlify/functions/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j.url) return { ok: false, message: j.error || 'Payments are not available right now.' }
    return { ok: true, url: j.url }
  } catch { return { ok: false, message: 'Payments are not available right now.' } }
}

// After paying, the buyer's access code is created by the payment webhook; this fetches it.
export async function claimAccess(sessionId) {
  try {
    const res = await fetch('/.netlify/functions/claim?session_id=' + encodeURIComponent(sessionId))
    return await res.json()
  } catch { return { status: 'error' } }
}

// ---- anonymous visitor actions ----
export function deviceId() {
  try {
    let d = localStorage.getItem('fv_device')
    if (!d) { d = crypto.randomUUID(); localStorage.setItem('fv_device', d) }
    return d
  } catch { return 'anon' }
}

export async function logView(ev) {
  if (!supabase) return
  try {
    const r = await supabase.from('view_events').insert({ ...ev, device_id: deviceId() })
    // If the database does not have the newer "source" column yet, record the view without it.
    if (r.error && ev.source) {
      const { source, ...rest } = ev
      await supabase.from('view_events').insert({ ...rest, device_id: deviceId() })
    }
  } catch { /* analytics must never break playback */ }
}

export async function castVote(film) {
  if (!supabase) return { ok: true }
  const r = await supabase.from('film_votes').insert({ film_id: film.id, festival_id: film.festival_id, device_id: deviceId() })
  if (r.error) return { ok: false, duplicate: r.error.code === '23505', message: r.error.message }
  return { ok: true }
}

export async function submitInquiry(i) {
  if (!supabase) return { ok: true }
  const r = await supabase.from('inquiries').insert(i)
  return r.error ? { ok: false, message: r.error.message } : { ok: true }
}
