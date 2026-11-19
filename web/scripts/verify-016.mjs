// Checks migration 016 (theater pre-show ad server) against the live database using only the public (anon) key.
// Run after the SQL has been run in Supabase:  node scripts/verify-016.mjs     Writes nothing.
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

for (const t of ['cinema_advertisers', 'cinema_ads', 'cinema_ad_events']) {
  const r = await get(t + '?select=*&limit=5')
  ok(t + ' exists and leaks nothing to the public', (r.status === 200 && Array.isArray(r.body) && r.body.length === 0) || r.status === 401 || r.status === 403, r.text.slice(0, 120))
  const w = await fetch(url + '/rest/v1/' + t, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({}) })
  ok('public cannot insert into ' + t, w.status === 401 || w.status === 403, 'status ' + w.status)
}
const sh = await get('cinema_board?select=id&limit=1')
ok('the public marquee still works', sh.status === 200, sh.text.slice(0, 100))
const col = await get('cinema_showings?select=trailer_ids,preshow_plan&limit=1')
ok('showings keep their trailer list and frozen reel columns', col.status === 200 || col.status === 401 || col.status === 403, col.text.slice(0, 120))
const j = await rpc('cinema_join', { p_showing: NIL, p_device: 'verify', p_code: null })
ok('cinema_join still answers the public (not found for an unknown showing)', j.status === 200 && j.body && j.body.status === 'not_found', j.text.slice(0, 120))
const ev = await rpc('cinema_ad_event', { p_ad: NIL, p_showing: NIL, p_device: 'verify', p_event: 'start', p_code: null })
ok('cinema_ad_event ignores an ad that is not in a reel', ev.status === 200 && ev.body === 'no_showing', ev.text.slice(0, 120))
const refused = [
  ['save_cinema_advertiser', { p_id: null, p_name: 'x', p_contact_name: null, p_contact_email: null, p_notes: null, p_active: true }],
  ['save_cinema_ad', { p_id: null, p_advertiser: NIL, p_title: 'x', p_url: 'https://x.example', p_dur: 10, p_click: null, p_cpm_cents: 0, p_starts_on: null, p_ends_on: null, p_max_impressions: null, p_priority: 0, p_active: true }],
  ['delete_cinema_ad', { p_id: NIL }],
  ['set_cinema_ads_enabled', { p_on: false }],
  ['save_cinema_trailer', { p_festival: NIL, p_id: null, p_title: 'x', p_url: 'https://x.example', p_dur: 10, p_click: null, p_active: true }],
  ['set_showing_trailers', { p_showing: NIL, p_ids: [] }],
  ['cinema_ad_report', { p_from: '2026-01-01', p_to: '2026-12-31' }],
  ['cinema_ad_daily', { p_ad: NIL, p_from: '2026-01-01', p_to: '2026-12-31' }],
  ['cinema_festival_ad_report', { p_festival: NIL, p_from: '2026-01-01', p_to: '2026-12-31' }],
  ['cinema_build_preshow', { p_showing: NIL }],
]
for (const [name, args] of refused) {
  const r = await rpc(name, args)
  ok(name + ' is refused for the public', r.status === 401 || r.status === 403, 'status ' + r.status + ' ' + r.text.slice(0, 100))
}
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
