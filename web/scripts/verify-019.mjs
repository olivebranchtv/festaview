// Checks migration 019 (My films library) against the live database with the public key only.
// Run after the SQL has been run in Supabase:  node scripts/verify-019.mjs     Writes nothing.
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + x)) }
const NIL = '00000000-0000-0000-0000-000000000000'
const rpc = (n, b) => fetch(url + '/rest/v1/rpc/' + n, { method: 'POST', headers: h, body: JSON.stringify(b) })
const a = await rpc('save_my_film', { p_id: null, p_data: { title: 'x' }, p_files: [] })
ok('save_my_film exists and is refused for the public', a.status === 401 || a.status === 403, 'status ' + a.status)
const d = await rpc('delete_my_film', { p_id: NIL })
ok('delete_my_film is refused for the public', d.status === 401 || d.status === 403, 'status ' + d.status)
const t = await fetch(url + '/rest/v1/filmmaker_films?select=id&limit=1', { headers: h })
ok('filmmaker_films exists and leaks nothing', t.status === 401 || t.status === 403 || (t.status === 200 && (await t.json()).length === 0), 'status ' + t.status)
console.log('
' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
