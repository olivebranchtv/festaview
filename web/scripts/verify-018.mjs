// Checks migration 018 (full submission details and file uploads) against the live database with the public key only.
// Run after the SQL has been run in Supabase:  node scripts/verify-018.mjs     Writes nothing.
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
const h = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
let pass = 0, fail = 0
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + x)) }
const NIL = '00000000-0000-0000-0000-000000000000'
const r1 = await fetch(url + '/rest/v1/rpc/save_submission_details', { method: 'POST', headers: h, body: JSON.stringify({ p_id: NIL, p_details: {}, p_files: [] }) })
ok('save_submission_details exists and is refused for the public', r1.status === 401 || r1.status === 403, 'status ' + r1.status)
const r2 = await fetch(url + '/rest/v1/submissions?select=details,files&limit=1', { headers: h })
ok('submissions has the details and files columns, nothing leaks', r2.status === 401 || r2.status === 403 || (r2.status === 200 && (await r2.json()).length === 0), 'status ' + r2.status)
const r3 = await fetch(url + '/storage/v1/object/public/submission-files/x/y.mp4')
ok('the submission-files bucket is private', r3.status === 400 || r3.status === 404 || r3.status === 401 || r3.status === 403, 'status ' + r3.status)
const r4 = await fetch(url + '/storage/v1/object/submission-files/' + NIL + '/x.mp4', { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key }, body: 'x' })
ok('the public cannot upload', r4.status === 400 || r4.status === 401 || r4.status === 403, 'status ' + r4.status)
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
