import crypto from 'node:crypto'
import { verifyStripeSignature, makeCode, feeCents, checkoutParams } from './lib/pay.mjs'
import checkout from './functions/checkout.mjs'
import webhook from './functions/stripe-webhook.mjs'
import vstart from './functions/virtual-start.mjs'
import claim from './functions/claim.mjs'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)) }

process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake'
process.env.SUPABASE_URL = 'https://db.example'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_fake'
process.env.URL = 'https://site.example'

const sign = (body, secret = 'whsec_fake', t = Math.floor(Date.now() / 1000)) => 't=' + t + ',v1=' + crypto.createHmac('sha256', secret).update(t + '.' + body).digest('hex')

// --- helpers
ok('code format', /^FV-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(makeCode()))
ok('codes are unique', new Set(Array.from({ length: 500 }, makeCode)).size === 500)
ok('fee 5% of $25.00', feeCents(2500, 5) === 125)
ok('fee 0%', feeCents(2500, 0) === 0)
const body = '{"a":1}'
ok('valid signature accepted', verifyStripeSignature(body, sign(body), 'whsec_fake'))
ok('wrong secret rejected', !verifyStripeSignature(body, sign(body, 'other'), 'whsec_fake'))
ok('tampered body rejected', !verifyStripeSignature('{"a":2}', sign(body), 'whsec_fake'))
ok('old timestamp rejected', !verifyStripeSignature(body, sign(body, 'whsec_fake', Math.floor(Date.now() / 1000) - 4000), 'whsec_fake'))
ok('missing header rejected', !verifyStripeSignature(body, null, 'whsec_fake'))
const cp = checkoutParams({ product: { id: 'p1', name: 'Pass', price_cents: 2500, currency: 'usd' }, festival: { id: 'f1', name: 'Fest', slug: 'fest' }, siteUrl: 'https://site.example' })
ok('checkout uses db price', cp.get('line_items[0][price_data][unit_amount]') === '2500')
ok('checkout success url has session placeholder', cp.get('success_url') === 'https://site.example/#/access?session_id={CHECKOUT_SESSION_ID}')

// --- fake database + Stripe
const db = {
  products: [{ id: '11111111-1111-1111-1111-111111111111', festival_id: 'f1', film_id: null, name: 'Festival Pass', price_cents: 2500, currency: 'usd', active: true, expires_at: null }],
  festivals: [{ id: 'f1', slug: 'fest', name: 'Fest', status: 'published', payments_enabled: true, ticket_fee_pct: 5 }],
  entitlements: [],
}
const calls = []
const rpcCalls = []
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts })
  const u = new URL(String(url))
  if (u.host === 'api.stripe.com') return new Response(JSON.stringify({ id: 'cs_test_abc', url: 'https://checkout.stripe.test/pay/cs_test_abc' }), { status: 200 })
  if (u.pathname.endsWith('/rpc/virtual_start')) { rpcCalls.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ status: 'ok', echo: JSON.parse(opts.body) }), { status: 200 }) }
  const table = u.pathname.replace('/rest/v1/', '')
  const q = u.searchParams
  if ((opts.method || 'GET') === 'GET') {
    let rows = db[table] || []
    for (const [k, v] of q.entries()) if (v.startsWith('eq.')) { const val = v.slice(3); rows = rows.filter((r) => String(r[k]) === val) }
    return new Response(JSON.stringify(rows), { status: 200 })
  }
  const row = JSON.parse(opts.body)
  if (table === 'entitlements' && db.entitlements.some((e) => e.stripe_session_id === row.stripe_session_id)) return new Response(null, { status: 201 }) // ignore-duplicates
  db[table].push(table === 'entitlements' ? { status: 'active', ...row } : row) // the real table defaults status to active
  return new Response(null, { status: 201 })
}
const post = (fn, bodyObj, headers = {}) => fn(new Request('https://site.example/x', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj) }))

// --- checkout
let r = await post(checkout, { productId: '11111111-1111-1111-1111-111111111111' })
let j = await r.json()
ok('checkout returns stripe url', r.status === 200 && j.url && j.url.includes('checkout.stripe.test'), JSON.stringify(j))
const stripeCall = calls.find((c) => c.url.includes('api.stripe.com'))
ok('stripe call is authorised with the server key only', stripeCall.opts.headers.Authorization === 'Bearer sk_test_fake')
ok('browser cannot set the price', !JSON.stringify(stripeCall.opts.body).includes('9999'))
r = await post(checkout, { productId: '11111111-1111-1111-1111-111111111111', price_cents: 1 })
ok('price in request body is ignored', (await r.json()).url && !calls.at(-1).opts.body.includes('unit_amount%5D=1&'))
r = await post(checkout, { productId: 'not-a-uuid' })
ok('bad product id rejected', r.status === 400)
r = await post(checkout, { productId: '22222222-2222-2222-2222-222222222222' })
ok('unknown product 404', r.status === 404)
db.festivals[0].payments_enabled = false
r = await post(checkout, { productId: '11111111-1111-1111-1111-111111111111' })
ok('payments off for festival is refused', r.status === 403)
db.festivals[0].payments_enabled = true
r = await checkout(new Request('https://site.example/x', { method: 'GET' }))
ok('checkout GET rejected', r.status === 405)

// --- webhook
const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_test_abc1234567', payment_status: 'paid', amount_total: 2500, customer_details: { email: 'buyer@example.com' }, metadata: { product_id: '11111111-1111-1111-1111-111111111111', festival_id: 'f1' } } } }
const evBody = JSON.stringify(event)
r = await post(webhook, evBody, { 'stripe-signature': 'bad' })
ok('forged webhook rejected', r.status === 400 && db.entitlements.length === 0)
r = await post(webhook, evBody, { 'stripe-signature': sign(evBody) })
ok('signed webhook creates one access code', r.status === 200 && db.entitlements.length === 1)
const ent = db.entitlements[0]
ok('entitlement amount, fee and email recorded', ent.amount_cents === 2500 && ent.fee_cents === 125 && ent.email === 'buyer@example.com' && ent.source === 'stripe')
r = await post(webhook, evBody, { 'stripe-signature': sign(evBody) })
ok('replayed webhook does not create a second code', r.status === 200 && db.entitlements.length === 1)
const unpaid = JSON.stringify({ ...event, data: { object: { ...event.data.object, id: 'cs_test_unpaid12345', payment_status: 'unpaid' } } })
r = await post(webhook, unpaid, { 'stripe-signature': sign(unpaid) })
ok('unpaid session creates nothing', db.entitlements.length === 1)
const other = JSON.stringify({ type: 'customer.created', data: { object: {} } })
r = await post(webhook, other, { 'stripe-signature': sign(other) })
ok('unrelated events ignored', r.status === 200 && db.entitlements.length === 1)

// --- claim
r = await claim(new Request('https://site.example/x?session_id=cs_test_abc1234567'))
j = await r.json()
ok('claim returns the code for a paid session', j.status === 'ready' && j.code === ent.code && j.festivalSlug === 'fest', JSON.stringify(j))
r = await claim(new Request('https://site.example/x?session_id=cs_test_neverpaid99'))
ok('claim pending when not recorded yet', (await r.json()).status === 'pending')
r = await claim(new Request('https://site.example/x?session_id=../../etc'))
ok('claim rejects malformed reference', r.status === 400)
r = await claim(new Request('https://site.example/x'))
ok('claim without reference rejected', r.status === 400)


// --- event tickets
db.products.push({ id: '33333333-3333-3333-3333-333333333333', festival_id: 'f1', film_id: null, event_id: 'ev-1', name: 'Premiere ticket', price_cents: 800, currency: 'usd', active: true, expires_at: null })
const evEvent = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_event99999', payment_status: 'paid', amount_total: 800, customer_details: { email: 'e@x.com' }, metadata: { product_id: '33333333-3333-3333-3333-333333333333', festival_id: 'f1' } } } })
r = await post(webhook, evEvent, { 'stripe-signature': sign(evEvent) })
const evEnt = db.entitlements.find((e) => e.stripe_session_id === 'cs_test_event99999')
ok('event ticket purchase records the event', !!evEnt && evEnt.event_id === 'ev-1' && evEnt.fee_cents === 40, JSON.stringify(evEnt))
r = await claim(new Request('https://site.example/x?session_id=cs_test_event99999'))
j = await r.json()
ok('claim returns the event to open', j.status === 'ready' && j.eventId === 'ev-1', JSON.stringify(j))

// --- virtual-start (region-checked screening start)
const vpost = (b, geo) => vstart(new Request('https://site.example/x', { method: 'POST', body: JSON.stringify(b) }), { geo: geo === undefined ? { country: { code: 'ca' } } : geo })
r = await vpost({ eventId: '44444444-4444-4444-4444-444444444444', code: 'FV-1', device: 'dev1' })
ok('virtual-start passes the event through to the database', r.status === 200 && rpcCalls.at(-1).p_event === '44444444-4444-4444-4444-444444444444')
ok('country comes from Netlify location, upper-cased', rpcCalls.at(-1).p_country === 'CA')
r = await vpost({ eventId: '44444444-4444-4444-4444-444444444444', code: '', device: 'd', country: 'US', p_country: 'US' })
ok('country in the request body is ignored', rpcCalls.at(-1).p_country === 'CA')
r = await vpost({ eventId: '44444444-4444-4444-4444-444444444444', code: '', device: 'd' }, null)
ok('no location data means no country is sent', rpcCalls.at(-1).p_country === null)
r = await vpost({ eventId: 'bad', code: '', device: 'd' })
ok('virtual-start rejects a bad event id', r.status === 400)
r = await vpost({ eventId: '44444444-4444-4444-4444-444444444444', code: 'x'.repeat(200), device: 'd' })
ok('virtual-start rejects oversized input', r.status === 400)
r = await vstart(new Request('https://site.example/x', { method: 'GET' }), {})
ok('virtual-start GET rejected', r.status === 405)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
