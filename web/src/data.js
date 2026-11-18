import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = url && key ? createClient(url, key) : null

// Demo content shown until a Supabase project is connected.
const DEMO = {
  demo: true,
  festivals: [
    { id: 'f1', slug: 'harborlight', name: 'Harborlight Film Festival', tagline: 'Stories from the coast', brand_color: '#3FA7D6' },
    { id: 'f2', slug: 'nightowl', name: 'Night Owl Horror Fest', tagline: 'Best watched after dark', brand_color: '#D64545' },
    { id: 'f3', slug: 'shortcut', name: 'Shortcut Shorts Festival', tagline: 'Big stories, small runtimes', brand_color: '#E6B34A' },
  ],
  films: [
    { id: 'm1', festival_id: 'f1', title: 'Salt and Rope', director: 'A. Moreno', runtime_min: 12, genre: 'Drama' },
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
}

// Flat queries merged in JS (PostgREST FK joins are unreliable on this stack).
export async function loadData() {
  if (!supabase) return DEMO
  const [f, m, l] = await Promise.all([
    supabase.from('festivals').select('*').eq('status', 'published').order('sort_order').order('name'),
    supabase.from('films').select('*').eq('status', 'published').order('created_at', { ascending: false }),
    supabase.from('live_feeds').select('*'),
  ])
  if (f.error) throw f.error
  return { demo: false, festivals: f.data || [], films: m.data || [], feeds: l.data || [] }
}
