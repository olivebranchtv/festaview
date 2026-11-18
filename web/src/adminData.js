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
