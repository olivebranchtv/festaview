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
  const r = id
    ? await supabase.from('films').update(row).eq('id', id)
    : await supabase.from('films').insert({ ...row, festival_id: fid })
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
