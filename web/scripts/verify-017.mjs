// Checks migration 017 (edit showing and business ads) against the live database using only the public (anon) key.
// Run after the SQL has been run in Supabase:  node scripts/verify-017.mjs     Writes nothing.
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

const NIL2 = NIL
const refused = [
  ['update_showing', { p_id: NIL2, p_title: 'x', p_description: null, p_poster: null, p_rating: null, p_starts_at: '2030-01-01T00:00:00Z', p_lobby: 10, p_qa: 0, p_seats: null, p_price_cents: 0, p_preroll: null, p_sponsor: null, p_screen: NIL2 }],
  ['save_cinema_spot', { p_festival: NIL2, p_id: null, p_kind: 'sponsor', p_title: 'x', p_url: 'https://x.example', p_dur: 10, p_click: null, p_sponsor: 'x', p_active: true }],
  ['set_showing_trailers', { p_showing: NIL2, p_ids: [] }],
  ['cinema_build_preshow', { p_showing: NIL2 }],
  ['cinema_festival_ad_report', { p_festival: NIL2, p_from: '2026-01-01', p_to: '2026-12-31' }],
]
for (const [name, args] of refused) {
  const r = await rpc(name, args)
  ok(name + ' is refused for the public', r.status === 401 || r.status === 403, 'status ' + r.status + ' ' + r.text.slice(0, 100))
}
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
