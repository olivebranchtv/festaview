import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key) : null

const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString()

// Demo content shown until a Supabase project is connected.
const DEMO = {
  demo: true,
  festivals: [
    { id: 'f1', slug: 'harborlight', name: 'Harborlight Film Festival', tagline: 'Stories from the coast', brand_color: '#3FA7D6', voting_open: true },
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

// Flat queries merged in JS (PostgREST FK joins are unreliable on this stack).
export async function loadData() {
  if (!supabase) return DEMO
  const [f, m, l, s, v, sc] = await Promise.all([
    supabase.from('festivals').select('*').eq('status', 'published').order('sort_order').order('name'),
    supabase.from('films').select('*').eq('status', 'published').order('created_at', { ascending: false }),
    supabase.from('live_feeds').select('*'),
    supabase.from('schedule_items').select('*').gte('ends_at', new Date().toISOString()).order('starts_at').limit(200),
    // Venues and screenings are optional: if their tables are missing, the site still loads.
    supabase.from('venues').select('*'),
    supabase.from('screenings').select('*').gte('ends_at', new Date().toISOString()).order('starts_at').limit(300),
  ])
  if (f.error) throw f.error
  return { demo: false, festivals: f.data || [], films: m.data || [], feeds: l.data || [], schedule: s.data || [], venues: v.data || [], screenings: sc.data || [] }
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
  try { await supabase.from('view_events').insert({ ...ev, device_id: deviceId() }) } catch { /* analytics must never break playback */ }
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
