import { supabase } from './data.js'

// With no Supabase connected, the admin runs in demo mode backed by localStorage (single festival, no login).
export const isDemo = !supabase

const KEY = 'festaview_admin_demo'
const seed = () => ({
  festival: { id: 'demo', slug: 'my-festival', name: 'My Festival', tagline: '', description: '', brand_color: '#E6B34A', website: '', status: 'draft' },
  films: [],
  feeds: [],
})
function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || seed() } catch { return seed() }
}
function persist(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
}
const uid = () => 'x' + Math.random().toString(36).slice(2, 10)

const clean = (o) => {
  const out = {}
  for (const [k, v] of Object.entries(o)) out[k] = v === '' ? null : v
  return out
}

// ---- auth ----
export async function getSession() {
  if (isDemo) return { demo: true }
  const { data } = await supabase.auth.getSession()
  return data.session
}
export function onAuth(cb) {
  if (isDemo) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_e, s) => cb(s))
  return () => data.subscription.unsubscribe()
}
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}
export async function signOut() {
  if (!isDemo) await supabase.auth.signOut()
}

// ---- festivals ----
export async function myFestivals() {
  if (isDemo) return [load().festival]
  const { data: u } = await supabase.auth.getUser()
  const a = await supabase.from('festival_admins').select('festival_id').eq('user_id', u.user.id)
  if (a.error) throw a.error
  const ids = (a.data || []).map((r) => r.festival_id)
  if (!ids.length) return []
  const f = await supabase.from('festivals').select('*').in('id', ids).order('name')
  if (f.error) throw f.error
  return f.data
}
export async function saveFestival(f) {
  if (isDemo) {
    const s = load(); s.festival = { ...s.festival, ...f }; persist(s); return s.festival
  }
  const { id, ...rest } = f
  const r = await supabase.from('festivals').update(clean(rest)).eq('id', id).select().single()
  if (r.error) throw r.error
  return r.data
}

// ---- films ----
export async function listFilms(fid) {
  if (isDemo) return load().films
  const r = await supabase.from('films').select('*').eq('festival_id', fid).order('created_at', { ascending: false })
  if (r.error) throw r.error
  return r.data
}
export async function saveFilm(fid, film) {
  if (isDemo) {
    const s = load()
    if (film.id) s.films = s.films.map((m) => (m.id === film.id ? { ...m, ...film } : m))
    else s.films.unshift({ ...film, id: uid(), festival_id: fid })
    persist(s); return
  }
  const { id, ...rest } = film
  const row = clean(rest)
  const write = (rw) => (id
    ? supabase.from('films').update(rw).eq('id', id)
    : supabase.from('films').insert({ ...rw, festival_id: fid }))
  let r = await write(row)
  // If the paid-access SQL has not been run yet, saving still works without the new "access" setting.
  if (r.error && 'access' in row && /access/i.test(r.error.message || '')) {
    const { access, ...rest } = row
    r = await write(rest)
  }
  // If the film category SQL has not been run yet, saving still works without the category.
  if (r.error && 'category' in row && /category/i.test(r.error.message || '')) {
    const { category, ...rest } = row
    r = await write(rest)
  }
  if (r.error) throw r.error
}
export async function deleteFilm(id) {
  if (isDemo) { const s = load(); s.films = s.films.filter((m) => m.id !== id); persist(s); return }
  const r = await supabase.from('films').delete().eq('id', id)
  if (r.error) throw r.error
}

// ---- live feeds ----
export async function listFeeds(fid) {
  if (isDemo) return load().feeds
  const r = await supabase.from('live_feeds').select('*').eq('festival_id', fid).order('created_at')
  if (r.error) throw r.error
  return r.data
}
export async function saveFeed(fid, feed) {
  if (isDemo) {
    const s = load()
    if (feed.id) s.feeds = s.feeds.map((l) => (l.id === feed.id ? { ...l, ...feed } : l))
    else s.feeds.push({ ...feed, id: uid(), festival_id: fid })
    persist(s); return
  }
  const { id, ...rest } = feed
  const row = clean(rest)
  const r = id
    ? await supabase.from('live_feeds').update(row).eq('id', id)
    : await supabase.from('live_feeds').insert({ ...row, festival_id: fid })
  if (r.error) throw r.error
}
export async function deleteFeed(id) {
  if (isDemo) { const s = load(); s.feeds = s.feeds.filter((l) => l.id !== id); persist(s); return }
  const r = await supabase.from('live_feeds').delete().eq('id', id)
  if (r.error) throw r.error
}

// ---- media ----
export async function uploadImage(fid, file) {
  if (isDemo) {
    return new Promise((resolve, reject) => {
      const rd = new FileReader()
      rd.onload = () => resolve(rd.result)
      rd.onerror = () => reject(new Error('Could not read file'))
      rd.readAsDataURL(file)
    })
  }
  const path = fid + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const up = await supabase.storage.from('festival-media').upload(path, file)
  if (up.error) throw up.error
  return supabase.storage.from('festival-media').getPublicUrl(path).data.publicUrl
}

// ---- account creation ----
export async function signUp(email, password) {
  if (isDemo) throw new Error('Sign-up needs a connected database.')
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
}

// ---- live schedule ----
export async function listSchedule(feedId) {
  if (isDemo) return (load().schedule || []).filter((s) => s.live_feed_id === feedId)
  const r = await supabase.from('schedule_items').select('*').eq('live_feed_id', feedId).order('starts_at')
  if (r.error) throw r.error
  return r.data
}
export async function saveSchedule(item) {
  if (isDemo) {
    const s = load(); s.schedule = s.schedule || []
    s.schedule.push({ ...item, id: uid() }); persist(s); return
  }
  const r = await supabase.from('schedule_items').insert(clean(item))
  if (r.error) throw r.error
}
export async function deleteSchedule(id) {
  if (isDemo) { const s = load(); s.schedule = (s.schedule || []).filter((x) => x.id !== id); persist(s); return }
  const r = await supabase.from('schedule_items').delete().eq('id', id)
  if (r.error) throw r.error
}

// ---- analytics, votes, filmmaker shares ----
export async function filmStats(fid, days) {
  if (isDemo) return []
  const since = new Date(Date.now() - days * 864e5).toISOString()
  const r = await supabase.rpc('festival_film_stats', { p_festival: fid, p_since: since })
  if (r.error) throw r.error
  return r.data || []
}
export async function voteCounts(fid) {
  if (isDemo) return {}
  const r = await supabase.from('film_votes').select('film_id').eq('festival_id', fid)
  if (r.error) throw r.error
  const out = {}
  for (const v of r.data || []) out[v.film_id] = (out[v.film_id] || 0) + 1
  return out
}
export async function listShares(filmIds) {
  if (isDemo) return (load().shares || []).filter((s) => filmIds.includes(s.film_id))
  if (!filmIds.length) return []
  const r = await supabase.from('filmmaker_shares').select('*').in('film_id', filmIds)
  if (r.error) throw r.error
  return r.data
}
export async function saveShare(share) {
  if (isDemo) { const s = load(); s.shares = s.shares || []; s.shares.push({ ...share, id: uid() }); persist(s); return }
  const r = await supabase.from('filmmaker_shares').insert(clean(share))
  if (r.error) throw r.error
}
export async function deleteShare(id) {
  if (isDemo) { const s = load(); s.shares = (s.shares || []).filter((x) => x.id !== id); persist(s); return }
  const r = await supabase.from('filmmaker_shares').delete().eq('id', id)
  if (r.error) throw r.error
}

// ---- network owner console ----
export async function isPlatformAdmin() {
  if (isDemo) return false
  const { data: u } = await supabase.auth.getUser()
  if (!u || !u.user) return false
  const r = await supabase.from('platform_admins').select('user_id').eq('user_id', u.user.id)
  return !r.error && (r.data || []).length > 0
}
export async function allFestivals() {
  const r = await supabase.from('festivals').select('*').order('created_at', { ascending: false })
  if (r.error) throw r.error
  return r.data
}
export async function createFestival({ slug, name }) {
  const r = await supabase.from('festivals').insert({ slug, name, status: 'draft' })
  if (r.error) throw r.error
}
export async function setFestivalStatus(id, status) {
  const r = await supabase.from('festivals').update({ status }).eq('id', id)
  if (r.error) throw r.error
}
export async function assignAdmin(email, festivalId) {
  const r = await supabase.rpc('assign_festival_admin', { p_email: email, p_festival: festivalId })
  if (r.error) throw r.error
  return r.data
}
export async function listInquiries() {
  const r = await supabase.from('inquiries').select('*').order('created_at', { ascending: false }).limit(100)
  if (r.error) throw r.error
  return r.data
}

// ---- venues and screenings ----
export async function listVenues(fid) {
  if (isDemo) return load().venues || []
  const r = await supabase.from('venues').select('*').eq('festival_id', fid).order('name')
  if (r.error) throw r.error
  return r.data
}
export async function saveVenue(fid, v) {
  if (isDemo) { const s = load(); s.venues = s.venues || []; s.venues.push({ ...v, id: uid(), festival_id: fid }); persist(s); return }
  const r = await supabase.from('venues').insert({ ...clean(v), festival_id: fid })
  if (r.error) throw r.error
}
export async function deleteVenue(id) {
  if (isDemo) { const s = load(); s.venues = (s.venues || []).filter((x) => x.id !== id); persist(s); return }
  const r = await supabase.from('venues').delete().eq('id', id)
  if (r.error) throw r.error
}
export async function listScreenings(fid) {
  if (isDemo) return load().screenings || []
  const r = await supabase.from('screenings').select('*').eq('festival_id', fid).order('starts_at')
  if (r.error) throw r.error
  return r.data
}
export async function saveScreening(fid, sc) {
  if (isDemo) { const s = load(); s.screenings = s.screenings || []; s.screenings.push({ ...sc, id: uid(), festival_id: fid }); persist(s); return }
  const r = await supabase.from('screenings').insert({ ...clean(sc), festival_id: fid })
  if (r.error) throw r.error
}
export async function deleteScreening(id) {
  if (isDemo) { const s = load(); s.screenings = (s.screenings || []).filter((x) => x.id !== id); persist(s); return }
  const r = await supabase.from('screenings').delete().eq('id', id)
  if (r.error) throw r.error
}

// ---- screening packages (private master/DCP links) ----
export async function getMaster(filmId) {
  if (isDemo) return (load().masters || {})[filmId] || {}
  const r = await supabase.from('film_masters').select('*').eq('film_id', filmId)
  if (r.error) throw r.error
  return (r.data && r.data[0]) || {}
}
export async function saveMaster(filmId, m) {
  if (isDemo) { const s = load(); s.masters = s.masters || {}; s.masters[filmId] = m; persist(s); return }
  const r = await supabase.from('film_masters').upsert({ film_id: filmId, master_url: m.master_url || null, dcp_url: m.dcp_url || null, subtitles_url: m.subtitles_url || null, tech_notes: m.tech_notes || null })
  if (r.error) throw r.error
}

// ---- attendance logs ----
export async function listLogs(fid) {
  if (isDemo) return load().logs || []
  const r = await supabase.from('screening_logs').select('*').eq('festival_id', fid).order('logged_at', { ascending: false })
  if (r.error) throw r.error
  return r.data
}
export async function saveLog(fid, log) {
  if (isDemo) { const s = load(); s.logs = s.logs || []; s.logs.push({ ...log, id: uid(), festival_id: fid }); persist(s); return }
  const r = await supabase.from('screening_logs').insert({ ...clean(log), festival_id: fid })
  if (r.error) throw r.error
}

// ---- network-wide analytics (network owner only) ----
async function demoNetwork(days) {
  const { loadData } = await import('./data.js')
  const d = await loadData()
  const k = days / 30
  const overview = d.festivals.map((f, i) => ({ festival_id: f.id, views: Math.round((420 - i * 130) * k), seconds: Math.round((420 - i * 130) * k * 1900), impressions: 0, viewers: Math.round((260 - i * 80) * k) }))
  const filmStats = d.films.slice(0, 6).map((m, i) => ({ film_id: m.id, festival_id: m.festival_id, views: Math.round((180 - i * 25) * k), seconds: Math.round((180 - i * 25) * k * 2100), impressions: 0 }))
  const daily = []
  for (let n = Math.min(days, 90) - 1; n >= 0; n--) {
    const day = new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
    const w = 55 + ((n * 37) % 50) + (n < 7 ? 30 : 0)
    daily.push({ day, views: w, seconds: w * 1900, viewers: Math.round(w * 0.6) })
  }
  const views = overview.reduce((a, r) => a + r.views, 0)
  const seconds = overview.reduce((a, r) => a + r.seconds, 0)
  return {
    festivals: d.festivals.map((f) => ({ ...f, status: 'published' })),
    films: d.films.map((m) => ({ ...m, status: 'published' })),
    feeds: d.feeds.map((l) => ({ ...l, stream_url: l.stream_url || 'https://example.com/live.m3u8' })),
    admins: d.festivals.slice(0, 2).map((f) => ({ festival_id: f.id, user_id: 'demo' })),
    overview, filmStats, daily, inquiries: 3, missingSql: false,
    totals: { views, seconds, impressions: 0, viewers: Math.round(views * 0.62) },
    sources: [{ source: 'web', views: Math.round(views * 0.7), seconds: Math.round(seconds * 0.6) }, { source: 'channel', views: Math.round(views * 0.3), seconds: Math.round(seconds * 0.4) }],
  }
}

export async function networkData(days) {
  if (isDemo) return demoNetwork(days)
  const since = new Date(Date.now() - days * 864e5).toISOString()
  const [fest, films, feeds, admins, tot, ov, fs, dy, src, inq] = await Promise.all([
    supabase.from('festivals').select('*').order('created_at', { ascending: false }),
    supabase.from('films').select('id,festival_id,title,status,video_url,duration_sec,runtime_min,created_at'),
    supabase.from('live_feeds').select('id,festival_id,name,stream_url,is_live,is_replay_loop'),
    supabase.from('festival_admins').select('festival_id,user_id'),
    supabase.rpc('network_totals', { p_since: since }),
    supabase.rpc('network_overview', { p_since: since }),
    supabase.rpc('network_films', { p_since: since }),
    supabase.rpc('network_daily', { p_since: since }),
    supabase.rpc('network_sources', { p_since: since }),
    supabase.from('inquiries').select('id').gte('created_at', since),
  ])
  if (fest.error) throw fest.error
  return {
    festivals: fest.data || [], films: films.data || [], feeds: feeds.data || [], admins: admins.data || [],
    totals: (tot.data && tot.data[0]) || { views: 0, seconds: 0, impressions: 0, viewers: 0 },
    overview: ov.data || [], filmStats: fs.data || [], daily: dy.data || [], sources: src.data || [],
    inquiries: (inq.data || []).length,
    missingSql: [tot, ov, fs, dy, src].some((r) => r.error),
  }
}

// ---- paid access: products, access codes, sales ----
export async function listProducts(fid) {
  if (isDemo) return load().products || []
  const r = await supabase.from('products').select('*').eq('festival_id', fid).order('created_at')
  if (r.error) throw r.error
  return r.data
}
export async function saveProduct(fid, p) {
  if (isDemo) { const s = load(); s.products = s.products || []; s.products.push({ ...p, id: uid(), festival_id: fid, active: true }); persist(s); return }
  const r = await supabase.from('products').insert({ ...clean(p), festival_id: fid })
  if (r.error) throw r.error
}
export async function setProductActive(id, active) {
  if (isDemo) { const s = load(); s.products = (s.products || []).map((x) => (x.id === id ? { ...x, active } : x)); persist(s); return }
  const r = await supabase.from('products').update({ active }).eq('id', id)
  if (r.error) throw r.error
}
export async function deleteProduct(id) {
  if (isDemo) { const s = load(); s.products = (s.products || []).filter((x) => x.id !== id); persist(s); return }
  const r = await supabase.from('products').delete().eq('id', id)
  if (r.error) throw r.error
}
export async function listEntitlements(fid) {
  if (isDemo) return load().entitlements || []
  const r = await supabase.from('entitlements').select('*').eq('festival_id', fid).order('created_at', { ascending: false }).limit(500)
  if (r.error) throw r.error
  return r.data
}
export async function revokeEntitlement(id) {
  if (isDemo) { const s = load(); s.entitlements = (s.entitlements || []).map((x) => (x.id === id ? { ...x, status: 'revoked' } : x)); persist(s); return }
  const r = await supabase.from('entitlements').update({ status: 'revoked' }).eq('id', id)
  if (r.error) throw r.error
}
export async function createCompCodes(fid, count, filmId, note, expiresAt, eventId, overridesGeo) {
  if (isDemo) {
    const s = load(); s.entitlements = s.entitlements || []
    const codes = []
    for (let i = 0; i < count; i++) {
      const code = 'FV-' + Math.random().toString(16).slice(2, 6).toUpperCase() + '-' + Math.random().toString(16).slice(2, 6).toUpperCase() + '-' + Math.random().toString(16).slice(2, 6).toUpperCase()
      s.entitlements.unshift({ id: uid(), festival_id: fid, film_id: filmId || null, event_id: eventId || null, overrides_geo: !!overridesGeo, code, note, source: 'comp', status: 'active', amount_cents: 0, fee_cents: 0, created_at: new Date().toISOString() })
      codes.push(code)
    }
    persist(s); return codes
  }
  const r = await supabase.rpc('create_comp_codes', { p_festival: fid, p_count: count, p_film: filmId || null, p_note: note || null, p_expires: expiresAt || null, p_event: eventId || null, p_overrides_geo: !!overridesGeo })
  if (r.error) throw r.error
  return r.data || []
}
export async function setFestivalPayments(id, enabled, feePct) {
  const r = await supabase.from('festivals').update({ payments_enabled: enabled, ticket_fee_pct: feePct }).eq('id', id)
  if (r.error) throw r.error
}

// ---- virtual cinema ----
export async function listEvents(fid) {
  if (isDemo) return load().events || []
  const r = await supabase.from('virtual_events').select('*').eq('festival_id', fid).order('created_at', { ascending: false })
  if (r.error) throw r.error
  return r.data
}
export async function saveEvent(fid, ev) {
  if (isDemo) {
    const s = load(); s.events = s.events || []
    if (ev.id) s.events = s.events.map((x) => (x.id === ev.id ? { ...x, ...ev } : x))
    else s.events.unshift({ ...ev, id: uid(), festival_id: fid })
    persist(s); return
  }
  const { id, ...rest } = ev
  const row = clean(rest)
  const r = id ? await supabase.from('virtual_events').update(row).eq('id', id) : await supabase.from('virtual_events').insert({ ...row, festival_id: fid })
  if (r.error) throw r.error
}
export async function deleteEvent(id) {
  if (isDemo) { const s = load(); s.events = (s.events || []).filter((x) => x.id !== id); persist(s); return }
  const r = await supabase.from('virtual_events').delete().eq('id', id)
  if (r.error) throw r.error
}
export async function eventSessionCounts(ids) {
  if (isDemo || !ids.length) return {}
  const r = await supabase.from('virtual_sessions').select('event_id').in('event_id', ids)
  if (r.error) throw r.error
  const out = {}
  for (const x of r.data || []) out[x.event_id] = (out[x.event_id] || 0) + 1
  return out
}
export async function listReservations(eventId) {
  if (isDemo) return []
  const r = await supabase.from('virtual_reservations').select('email,created_at').eq('event_id', eventId).order('created_at')
  if (r.error) throw r.error
  return r.data
}
export async function listChatAdmin(eventId) {
  if (isDemo) return []
  const r = await supabase.from('chat_messages').select('*').eq('event_id', eventId).order('id', { ascending: false }).limit(200)
  if (r.error) throw r.error
  return r.data
}
export async function moderateChat(id, patch) {
  const r = await supabase.from('chat_messages').update(patch).eq('id', id)
  if (r.error) throw r.error
}

// ---- self-serve festival creation ----
export async function createMyFestival(f) {
  if (isDemo) {
    const s = load()
    s.festival = { ...s.festival, name: f.name, tagline: f.tagline || '', location: f.location || '', website: f.website || '' }
    persist(s)
    return { id: s.festival.id, slug: s.festival.slug }
  }
  const r = await supabase.rpc('create_my_festival', { p_name: f.name, p_tagline: f.tagline || null, p_location: f.location || null, p_website: f.website || null })
  if (r.error) throw r.error
  return r.data
}

// ---- virtual theater: booking (festivals) and owner controls ----
const demoScreens = () => [1, 2, 3, 4, 5, 6].map((n) => ({ id: 'sc' + n, number: n, name: 'Screen ' + n, active: true }))

export async function listCinemaScreens() {
  if (isDemo) return demoScreens()
  const r = await supabase.from('cinema_screens').select('*').eq('active', true).order('number')
  if (r.error) throw r.error
  return r.data
}
export async function listMyShowings(fid) {
  if (isDemo) return load().showings || []
  const r = await supabase.from('cinema_showings').select('*').eq('festival_id', fid).order('starts_at', { ascending: false }).limit(100)
  if (r.error) throw r.error
  return r.data
}
export async function showingSeatCounts(ids) {
  if (isDemo || !ids.length) return {}
  const r = await supabase.from('cinema_tickets').select('showing_id').in('showing_id', ids)
  if (r.error) throw r.error
  const out = {}
  for (const t of r.data || []) out[t.showing_id] = (out[t.showing_id] || 0) + 1
  return out
}
export async function bookShowing(a) {
  if (isDemo) {
    const s = load(); s.showings = s.showings || []
    const start = new Date(a.starts_at).getTime()
    const end = start + (a.runtime_min + a.qa) * 60000
    const clash = s.showings.some((x) => x.screen_id === a.screen_id && x.status !== 'cancelled' && new Date(x.starts_at).getTime() - x.lobby_minutes * 60000 < end + 300000 && start - a.lobby * 60000 < new Date(x.starts_at).getTime() + (x.runtime_min + x.qa_minutes) * 60000 + 300000)
    if (clash) throw new Error('That time overlaps another showing on this screen. Pick a different time or screen.')
    s.showings.unshift({ id: uid(), festival_id: a.festival_id, screen_id: a.screen_id, kind: a.kind, title: a.title, starts_at: a.starts_at, lobby_minutes: a.lobby, runtime_min: a.runtime_min, qa_minutes: a.qa, seats: a.seats, status: 'scheduled' })
    persist(s); return { status: 'scheduled' }
  }
  const r = await supabase.rpc('book_showing', {
    p_festival: a.festival_id, p_screen: a.screen_id, p_kind: a.kind, p_title: a.title, p_description: a.description || null, p_poster: a.poster_url || null,
    p_film_ids: a.film_ids || [], p_live_url: a.live_stream_url || null, p_preroll: a.preroll_url || null, p_sponsor: a.sponsor_name || null, p_rating: a.rating || null,
    p_starts_at: a.starts_at, p_lobby: a.lobby, p_qa: a.qa, p_seats: a.seats === '' || a.seats == null ? null : a.seats, p_live_runtime: a.live_runtime || null, p_price_cents: a.price_cents || 0,
  })
  if (r.error) throw r.error
  return r.data
}
export async function cancelShowing(id) {
  if (isDemo) { const s = load(); s.showings = (s.showings || []).map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)); persist(s); return }
  const r = await supabase.rpc('cancel_showing', { p_id: id })
  if (r.error) throw r.error
}

// owner only
export async function cinemaOwnerData() {
  const [st, sc, sh] = await Promise.all([
    supabase.from('cinema_settings').select('*').eq('id', 1),
    supabase.from('cinema_screens').select('*').order('number'),
    supabase.from('cinema_showings').select('*').in('status', ['pending', 'scheduled']).gte('starts_at', new Date(Date.now() - 864e5).toISOString()).order('starts_at'),
  ])
  const err = st.error || sc.error || sh.error
  if (err) throw err
  return { settings: (st.data && st.data[0]) || { require_approval: true, min_notice_hours: 24, max_upcoming: 30 }, screens: sc.data || [], showings: sh.data || [] }
}
export async function saveCinemaSettings(s) {
  const r = await supabase.from('cinema_settings').update({ require_approval: !!s.require_approval, min_notice_hours: s.min_notice_hours, max_upcoming: s.max_upcoming }).eq('id', 1)
  if (r.error) throw r.error
}
export async function addCinemaScreen(number, name) {
  const r = await supabase.from('cinema_screens').insert({ number, name })
  if (r.error) throw r.error
}
export async function updateCinemaScreen(id, patch) {
  const r = await supabase.from('cinema_screens').update(patch).eq('id', id)
  if (r.error) throw r.error
}
export async function approveShowing(id, okFlag) {
  const r = await supabase.rpc('approve_showing', { p_id: id, p_ok: okFlag })
  if (r.error) throw r.error
}

// ---- filmmaker submissions (festival side) ----
const needDb = () => { if (isDemo) throw new Error('Submissions need a connected database.') }
export async function submissionAdminData(fid) {
  if (isDemo) return { categories: [], tiers: [], waivers: [], submissions: [] }
  const [c, t, w, s] = await Promise.all([
    supabase.from('submission_categories').select('*').eq('festival_id', fid).order('sort_order'),
    supabase.from('submission_tiers').select('*').eq('festival_id', fid).order('sort_order'),
    supabase.from('submission_waivers').select('*').eq('festival_id', fid).order('created_at'),
    supabase.from('submissions').select('*').eq('festival_id', fid).in('payment_status', ['paid', 'free', 'waived', 'refunded']).order('created_at', { ascending: false }).limit(2000),
  ])
  const err = c.error || t.error || w.error || s.error
  if (err) throw err
  return { categories: c.data || [], tiers: t.data || [], waivers: w.data || [], submissions: s.data || [] }
}
export async function saveSubmissionSettings(fid, s) {
  needDb()
  const r = await supabase.rpc('save_submission_settings', { p_festival: fid, p_open: !!s.open, p_opens_at: s.opens_at || null, p_closes_at: s.closes_at || null, p_notes: s.notes || null })
  if (r.error) throw r.error
}
export async function saveSubmissionCategory(fid, c) {
  needDb()
  const r = await supabase.rpc('save_submission_category', {
    p_festival: fid, p_id: c.id || null, p_name: c.name, p_description: c.description || null, p_max_runtime: c.max_runtime_min || null, p_active: c.active !== false, p_tiers: c.tiers,
  })
  if (r.error) throw r.error
  return r.data
}
export async function deleteSubmissionCategory(id) {
  needDb()
  const r = await supabase.rpc('delete_submission_category', { p_id: id })
  if (r.error) throw r.error
  return r.data
}
export async function saveSubmissionWaiver(fid, w) {
  needDb()
  const r = await supabase.rpc('save_submission_waiver', { p_festival: fid, p_id: w.id || null, p_code: w.code, p_percent: w.percent_off, p_max_uses: w.max_uses || null, p_expires: w.expires_at || null, p_active: w.active !== false, p_note: w.note || null })
  if (r.error) throw r.error
}
export async function deleteSubmissionWaiver(id) {
  needDb()
  const r = await supabase.rpc('delete_submission_waiver', { p_id: id })
  if (r.error) throw r.error
}
export async function setSubmissionStatus(id, status, note) {
  needDb()
  const r = await supabase.rpc('set_submission_status', { p_id: id, p_status: status, p_note: note || null })
  if (r.error) throw r.error
}
export async function addSubmissionToFilms(id) {
  needDb()
  const r = await supabase.rpc('add_submission_to_films', { p_id: id })
  if (r.error) throw r.error
  return r.data
}

// ---- box office cut (owner only): per-title ticket rates
export async function ticketRatesData() {
  const [pr, sh] = await Promise.all([
    supabase.from('products').select('id,festival_id,name,price_cents,fee_pct,active,event_id,film_id').gt('price_cents', 0).order('created_at', { ascending: false }),
    supabase.from('cinema_showings').select('id,festival_id,title,price_cents,fee_pct,starts_at,status').gt('price_cents', 0).neq('status', 'cancelled').order('starts_at', { ascending: false }).limit(200),
  ])
  const err = pr.error || sh.error
  if (err) throw err
  return { products: pr.data || [], showings: sh.data || [] }
}
export async function setTicketRate(kind, id, pct) {
  const r = await supabase.rpc('set_ticket_rate', { p_kind: kind, p_id: id, p_pct: pct })
  if (r.error) throw r.error
}

// ---- Festaview Cinemas pre-show: our own ad server and trailers ----
const needAdsDb = () => { if (isDemo) throw new Error('The ad server needs a connected database.') }
const adRpc = async (name, args) => { needAdsDb(); const r = await supabase.rpc(name, args); if (r.error) throw r.error; return r.data }

// network owner
export async function cinemaAdsData() {
  if (isDemo) return { advertisers: [], ads: [], enabled: true }
  const [v, a, st] = await Promise.all([
    supabase.from('cinema_advertisers').select('*').order('name'),
    supabase.from('cinema_ads').select('*').eq('kind', 'ad').order('created_at', { ascending: false }),
    supabase.from('cinema_settings').select('ads_enabled').eq('id', 1),
  ])
  const err = v.error || a.error
  if (err) throw err
  return { advertisers: v.data || [], ads: a.data || [], enabled: !(st.data && st.data[0] && st.data[0].ads_enabled === false) }
}
export const saveAdvertiser = (a) => adRpc('save_cinema_advertiser', { p_id: a.id || null, p_name: a.name, p_contact_name: a.contact_name || null, p_contact_email: a.contact_email || null, p_notes: a.notes || null, p_active: a.active !== false })
export const saveCinemaAd = (a) => adRpc('save_cinema_ad', {
  p_id: a.id || null, p_advertiser: a.advertiser_id, p_title: a.title, p_url: a.video_url, p_dur: a.duration_sec, p_click: a.click_url || null, p_cpm_cents: a.cpm_cents || 0,
  p_starts_on: a.starts_on || null, p_ends_on: a.ends_on || null, p_max_impressions: a.max_impressions || null, p_priority: a.priority || 0, p_active: a.active !== false,
})
export const deleteCinemaAd = (id) => adRpc('delete_cinema_ad', { p_id: id })
export const setCinemaAdsEnabled = (on) => adRpc('set_cinema_ads_enabled', { p_on: on })
export const cinemaAdReport = (from, to) => adRpc('cinema_ad_report', { p_from: from, p_to: to })
export const cinemaAdDaily = (ad, from, to) => adRpc('cinema_ad_daily', { p_ad: ad, p_from: from, p_to: to })

// festival
export async function listTrailers(fid) {
  if (isDemo) return []
  const r = await supabase.from('cinema_ads').select('*').eq('festival_id', fid).in('kind', ['trailer', 'sponsor']).order('created_at', { ascending: false })
  if (r.error) throw r.error
  return r.data || []
}
export const saveTrailer = (fid, t) => adRpc('save_cinema_spot', { p_festival: fid, p_id: t.id || null, p_kind: t.kind || 'trailer', p_sponsor: t.sponsor_name || null, p_title: t.title, p_url: t.video_url, p_dur: t.duration_sec, p_click: t.click_url || null, p_active: t.active !== false })
export const setShowingTrailers = (showingId, ids) => adRpc('set_showing_trailers', { p_showing: showingId, p_ids: ids })
export const festivalAdReport = (fid, from, to) => adRpc('cinema_festival_ad_report', { p_festival: fid, p_from: from, p_to: to })

// Edits a showing the festival booked (time, screen, seats and price lock once the doors open).
export async function updateShowing(id, a) {
  if (isDemo) {
    const s = load(); s.showings = (s.showings || []).map((x) => (x.id === id ? { ...x, title: a.title, starts_at: a.starts_at, lobby_minutes: a.lobby, qa_minutes: a.qa, seats: a.seats } : x)); persist(s)
    return { status: 'scheduled' }
  }
  const r = await supabase.rpc('update_showing', {
    p_id: id, p_title: a.title, p_description: a.description || null, p_poster: a.poster_url || null, p_rating: a.rating || null, p_starts_at: a.starts_at,
    p_lobby: a.lobby, p_qa: a.qa, p_seats: a.seats, p_price_cents: a.price_cents || 0, p_preroll: a.preroll_url || null, p_sponsor: a.sponsor_name || null, p_screen: a.screen_id,
  })
  if (r.error) throw r.error
  return r.data
}

// ---- Roku ads (network owner): our own fallback spots and the Adtelligent fill report ----
export async function listRokuSpots() {
  const r = await supabase.from('roku_fallback_spots').select('*').order('created_at')
  if (r.error) throw r.error
  return r.data || []
}
export async function addRokuSpot(s) {
  const r = await supabase.from('roku_fallback_spots').insert({ title: s.title, video_url: s.video_url, click_url: s.click_url || null, duration_seconds: s.duration_seconds })
  if (r.error) throw r.error
}
export async function setRokuSpotActive(id, active) {
  const r = await supabase.from('roku_fallback_spots').update({ active }).eq('id', id)
  if (r.error) throw r.error
}
export async function deleteRokuSpot(id) {
  const r = await supabase.from('roku_fallback_spots').delete().eq('id', id)
  if (r.error) throw r.error
}
// Slot counts for the last N days (a flat table; summed in the page).
export async function rokuAdCounts(days) {
  const since = new Date(Date.now() - (days + 1) * 864e5).toISOString().slice(0, 10)
  const r = await supabase.from('roku_ad_counts').select('day,source,spot,event,n').gte('day', since)
  if (r.error) throw r.error
  return r.data || []
}

// ---- Roku ad breaks (network owner): how many ads before a film, midroll breaks, lobby ads ----
export async function getRokuAdSettings() {
  const r = await supabase.from('roku_ad_settings').select('*').eq('id', 1)
  if (r.error) throw r.error
  return (r.data && r.data[0]) || { preroll_count: 4, midroll_count: 2, midroll_interval_minutes: 10, midroll_ads_per_break: 1, lobby_count: 2 }
}
export async function saveRokuAdSettings(s) {
  const r = await supabase.from('roku_ad_settings').upsert({
    id: 1, preroll_count: s.preroll_count, midroll_count: s.midroll_count, midroll_interval_minutes: s.midroll_interval_minutes,
    midroll_ads_per_break: s.midroll_ads_per_break, lobby_count: s.lobby_count, updated_at: new Date().toISOString(),
  })
  if (r.error) throw r.error
}
