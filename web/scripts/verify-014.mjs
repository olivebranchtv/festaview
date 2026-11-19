// Checks migration 014 (filmmaker submissions) against the live database using only the public (anon) key.
// Run after the SQL has been run in Supabase:  node scripts/verify-014.mjs
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from web/.env. Writes nothing.
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)) }
const get = async (p) => { const r = await fetch(url + '/rest/v1/' + p, { headers: h }); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { /* not json */ } return { status: r.status, body: j, text: t } }
const rpc = async (n, b) => { const r = await fetch(url + '/rest/v1/rpc/' + n, { method: 'POST', headers: h, body: JSON.stringify(b) }); const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { /* not json */ } return { status: r.status, body: j, text: t } }
const NIL = '00000000-0000-0000-0000-000000000000'

for (const t of ['submission_categories', 'submission_tiers']) {
  const r = await get(t + '?select=id&limit=1')
  ok(t + ' exists and is publicly readable (only published festivals)', r.status === 200 && Array.isArray(r.body), r.text.slice(0, 120))
}
for (const t of ['submissions', 'submission_waivers', 'filmmaker_profiles']) {
  const r = await get(t + '?select=*&limit=5')
  ok(t + ' is hidden from the public (no rows leak)', (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) || r.status === 401 || r.status === 403, r.text.slice(0, 120))
}
const f = await get('festivals?select=id,submissions_open,submissions_opens_at,submissions_closes_at,submission_notes&limit=1')
ok('festivals has the submission settings columns', f.status === 200, f.text.slice(0, 120))

// Writes must be refused for the public, both directly and through the functions.
for (const t of ['submission_categories', 'submission_tiers', 'submissions', 'submission_waivers', 'filmmaker_profiles']) {
  const r = await fetch(url + '/rest/v1/' + t, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({}) })
  ok('public cannot insert into ' + t, r.status === 401 || r.status === 403, 'status ' + r.status)
}
const q = await rpc('submission_quote', { p_festival: NIL, p_category: NIL, p_code: null })
ok('submission_quote answers the public (closed for an unknown festival)', q.status === 200 && q.body && q.body.ok === false, q.text.slice(0, 120))
const writes = [
  ['create_submission', { p_festival: NIL, p_category: NIL, p_title: 'x', p_director: 'x', p_runtime: 1, p_year: null, p_synopsis: 'xxxxxxxxxx', p_screener: 'https://x.example', p_screener_password: null, p_poster: null, p_country: null, p_language: null, p_genre: null, p_code: null }],
  ['save_filmmaker_profile', { p_name: 'xx', p_country: null, p_bio: null, p_website: null }],
  ['update_my_submission', { p_id: NIL, p_title: 'x', p_director: 'x', p_runtime: 1, p_year: null, p_synopsis: 'x', p_screener: 'https://x.example', p_screener_password: null, p_poster: null, p_country: null, p_language: null, p_genre: null }],
  ['withdraw_my_submission', { p_id: NIL }],
  ['save_submission_settings', { p_festival: NIL, p_open: true, p_opens_at: null, p_closes_at: null, p_notes: null }],
  ['save_submission_category', { p_festival: NIL, p_id: null, p_name: 'x', p_description: null, p_max_runtime: null, p_active: true, p_tiers: [{ name: 'x', deadline: null, fee_cents: 0 }] }],
  ['delete_submission_category', { p_id: NIL }],
  ['save_submission_waiver', { p_festival: NIL, p_id: null, p_code: 'XXXX', p_percent: 100, p_max_uses: null, p_expires: null, p_active: true, p_note: null }],
  ['delete_submission_waiver', { p_id: NIL }],
  ['set_submission_status', { p_id: NIL, p_status: 'accepted', p_note: null }],
  ['add_submission_to_films', { p_id: NIL }],
  ['submission_requote', { p_id: NIL, p_code: null }],
  ['submission_mark_paid', { p_id: NIL, p_session: 'cs_x', p_email: '', p_amount: 0, p_fee: 0 }],
]
for (const [name, args] of writes) {
  const r = await rpc(name, args)
  ok(name + ' is refused for the public', r.status === 401 || r.status === 403, 'status ' + r.status + ' ' + r.text.slice(0, 100))
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
