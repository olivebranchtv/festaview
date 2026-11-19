import { supabase, loadData } from './data.js'
import { festivalCategories, currentTier, submissionState } from './submissionRules.js'

// Filmmaker side of submissions. With no database connected it runs on demo data kept in this browser.
const KEY = 'festaview_demo_submissions'
const demoStore = () => { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
const demoSave = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)) } catch { /* ignore */ } }
const inDays = (d) => new Date(Date.now() + d * 864e5).toISOString()
const DEMO_FESTIVAL = { submissions_open: true, submissions_opens_at: null, submissions_closes_at: inDays(90), submission_notes: 'We program films from first-time and established filmmakers. Screener links must stay live through our decision date.' }
const demoCats = () => [
  { id: 'dc1', festival_id: 'f1', name: 'Short film', description: 'Up to 40 minutes', max_runtime_min: 40, active: true, sort_order: 1 },
  { id: 'dc2', festival_id: 'f1', name: 'Feature film', description: 'Over 40 minutes', max_runtime_min: null, active: true, sort_order: 2 },
  { id: 'dc3', festival_id: 'f3', name: 'Short film', description: '', max_runtime_min: 20, active: true, sort_order: 1 },
]
const demoTiers = () => [
  { id: 'dt1', category_id: 'dc1', festival_id: 'f1', name: 'Early', deadline: inDays(20), fee_cents: 2500, sort_order: 1 },
  { id: 'dt2', category_id: 'dc1', festival_id: 'f1', name: 'Regular', deadline: inDays(60), fee_cents: 3500, sort_order: 2 },
  { id: 'dt3', category_id: 'dc1', festival_id: 'f1', name: 'Late', deadline: inDays(90), fee_cents: 5000, sort_order: 3 },
  { id: 'dt4', category_id: 'dc2', festival_id: 'f1', name: 'Regular', deadline: inDays(90), fee_cents: 6500, sort_order: 1 },
  { id: 'dt5', category_id: 'dc3', festival_id: 'f3', name: 'Regular', deadline: null, fee_cents: 0, sort_order: 1 },
]

// Festivals that publish submissions, with their categories and today's fees. Flat queries merged here.
export async function loadSubmissionBoard() {
  const data = await loadData()
  let festivals = data.festivals
  let cats, tiers
  if (!supabase) {
    festivals = festivals.map((f) => (f.id === 'f1' || f.id === 'f3' ? { ...f, ...DEMO_FESTIVAL } : f))
    cats = demoCats(); tiers = demoTiers()
  } else {
    const [c, t] = await Promise.all([supabase.from('submission_categories').select('*'), supabase.from('submission_tiers').select('*')])
    cats = c.error ? [] : c.data || []
    tiers = t.error ? [] : t.data || []
  }
  const now = Date.now()
  const open = festivals
    .filter((f) => f.submissions_open)
    .map((f) => ({ festival: f, state: submissionState(f, now), categories: festivalCategories(cats, tiers, f.id, now) }))
    .filter((x) => x.categories.length > 0)
  return { demo: !supabase, entries: open, festivals, categories: cats, tiers }
}

export async function getQuote(festivalId, categoryId, code, board) {
  if (!supabase) {
    const cat = board.categories.find((c) => c.id === categoryId)
    const t = currentTier(board.tiers.filter((x) => x.category_id === categoryId))
    if (!cat || !t) return { ok: false, reason: 'closed' }
    const c = String(code || '').trim().toUpperCase()
    const pct = c === 'HALF' ? 50 : c === 'FREE' ? 100 : 0
    return { ok: true, base_cents: t.fee_cents, amount_cents: Math.round((t.fee_cents * (100 - pct)) / 100), tier_name: t.name, deadline: t.deadline, code_ok: pct > 0 }
  }
  const r = await supabase.rpc('submission_quote', { p_festival: festivalId, p_category: categoryId, p_code: code || null })
  return r.error || !r.data ? { ok: false, reason: 'error' } : r.data
}

export async function getProfile() {
  if (!supabase) { try { return JSON.parse(localStorage.getItem('festaview_demo_profile')) || null } catch { return null } }
  const r = await supabase.from('filmmaker_profiles').select('*').maybeSingle()
  return r.error ? null : r.data
}
export async function saveProfile(p) {
  if (!supabase) { try { localStorage.setItem('festaview_demo_profile', JSON.stringify(p)) } catch { /* ignore */ } return }
  const r = await supabase.rpc('save_filmmaker_profile', { p_name: p.name, p_country: p.country || null, p_bio: p.bio || null, p_website: p.website || null })
  if (r.error) throw new Error(r.error.message)
}

const num = (v) => (v === '' || v == null ? null : parseInt(v, 10) || null)

export async function createSubmission(festivalId, categoryId, f, code, board) {
  if (!supabase) {
    const q = await getQuote(festivalId, categoryId, code, board)
    const cat = board.categories.find((c) => c.id === categoryId)
    if (cat && cat.max_runtime_min && num(f.runtime_min) > cat.max_runtime_min) throw new Error('This category accepts films up to ' + cat.max_runtime_min + ' minutes.')
    const l = demoStore()
    const row = { id: 'ds' + Date.now(), festival_id: festivalId, category_id: categoryId, title: f.title, director: f.director, runtime_min: num(f.runtime_min), year: num(f.year), synopsis: f.synopsis, screener_url: f.screener_url, poster_url: f.poster_url, country: f.country, status: 'submitted', payment_status: q.amount_cents > 0 ? 'unpaid' : 'free', amount_due_cents: q.amount_cents, tier_name: q.tier_name, created_at: new Date().toISOString() }
    l.unshift(row); demoSave(l)
    return { id: row.id, payment_status: row.payment_status, amount_cents: q.amount_cents }
  }
  const r = await supabase.rpc('create_submission', {
    p_festival: festivalId, p_category: categoryId, p_title: f.title, p_director: f.director, p_runtime: num(f.runtime_min), p_year: num(f.year), p_synopsis: f.synopsis,
    p_screener: f.screener_url, p_screener_password: f.screener_password || null, p_poster: f.poster_url || null, p_country: f.country || null, p_language: f.language || null, p_genre: f.genre || null, p_code: code || null,
  })
  if (r.error) throw new Error(r.error.message)
  return r.data
}

export async function updateSubmission(id, f) {
  if (!supabase) { demoSave(demoStore().map((x) => (x.id === id ? { ...x, ...f, runtime_min: num(f.runtime_min), year: num(f.year) } : x))); return }
  const r = await supabase.rpc('update_my_submission', {
    p_id: id, p_title: f.title, p_director: f.director, p_runtime: num(f.runtime_min), p_year: num(f.year), p_synopsis: f.synopsis,
    p_screener: f.screener_url, p_screener_password: f.screener_password || null, p_poster: f.poster_url || null, p_country: f.country || null, p_language: f.language || null, p_genre: f.genre || null,
  })
  if (r.error) throw new Error(r.error.message)
}

export async function withdrawSubmission(id) {
  if (!supabase) { demoSave(demoStore().map((x) => (x.id === id ? { ...x, status: 'withdrawn' } : x))); return }
  const r = await supabase.rpc('withdraw_my_submission', { p_id: id })
  if (r.error) throw new Error(r.error.message)
}

export async function listMySubmissions() {
  if (!supabase) return demoStore()
  const r = await supabase.from('submissions').select('*').order('created_at', { ascending: false })
  if (r.error) throw new Error(r.error.message)
  return r.data || []
}

// Starts the card payment for an entry (the server works out the fee). Returns { url } to go to Stripe, or { done } if nothing is owed.
export async function payForSubmission(id, code) {
  if (!supabase) {
    demoSave(demoStore().map((x) => (x.id === id ? { ...x, payment_status: 'paid' } : x)))
    return { ok: true, done: true }
  }
  try {
    const res = await fetch('/.netlify/functions/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId: id, code: code || '' }) })
    const j = await res.json().catch(() => ({}))
    if (j.done) return { ok: true, done: true }
    if (!res.ok || !j.url) return { ok: false, message: j.error || 'Payments are not available right now.' }
    return { ok: true, url: j.url }
  } catch { return { ok: false, message: 'Payments are not available right now.' } }
}
