import crypto from 'node:crypto'
import { currentTier, submissionState, csvText, money as feeMoney } from '../src/submissionRules.js'
import { verifyStripeSignature, makeCode, feeCents, checkoutParams, ticketCheckoutParams, submissionCheckoutParams } from './lib/pay.mjs'
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
ok('checkout success url has session placeholder', cp.get('success_url') === 'https://site.example/access?session_id={CHECKOUT_SESSION_ID}')

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


// --- virtual theater tickets
const SH = '44444444-4444-4444-4444-444444444444', FREE = '55555555-5555-4555-8555-555555555555'
db.cinema_showings = [
  { id: SH, title: 'Premiere Night', price_cents: 1200, seats: 1, festival_id: 'f1', status: 'scheduled', starts_at: new Date(Date.now() + 3600e3).toISOString(), runtime_min: 90, qa_minutes: 0 },
  { id: FREE, title: 'Free Show', price_cents: 0, seats: null, festival_id: 'f1', status: 'scheduled', starts_at: new Date(Date.now() + 3600e3).toISOString(), runtime_min: 90, qa_minutes: 0 },
]
db.cinema_tickets = []
const refunds = []
const prevFetch = globalThis.fetch
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url))
  if (u.host === 'api.stripe.com' && u.pathname.endsWith('/refunds')) { refunds.push(String(opts.body)); return new Response('{}', { status: 200 }) }
  if (u.pathname.endsWith('/rpc/cinema_sell_ticket')) {
    const a = JSON.parse(opts.body)
    const ex = db.cinema_tickets.find((t) => t.stripe_session_id === a.p_session)
    if (ex) return new Response(JSON.stringify({ status: 'ok', code: ex.code }), { status: 200 })
    const s = db.cinema_showings.find((x) => x.id === a.p_showing)
    if (s.seats != null && db.cinema_tickets.length >= s.seats) return new Response(JSON.stringify({ status: 'sold_out' }), { status: 200 })
    const t = { showing_id: a.p_showing, code: 'FV-TEST-0000-0001', stripe_session_id: a.p_session, amount_cents: a.p_amount, fee_cents: a.p_fee, email: a.p_email }
    db.cinema_tickets.push(t)
    return new Response(JSON.stringify({ status: 'ok', code: t.code }), { status: 200 })
  }
  return prevFetch(url, opts)
}
const tp = ticketCheckoutParams({ showing: db.cinema_showings[0], festival: { id: 'f1', name: 'Fest', slug: 'fest' }, siteUrl: 'https://site.example' })
ok('ticket checkout uses the database price', tp.get('line_items[0][price_data][unit_amount]') === '1200' && tp.get('metadata[showing_id]') === SH)
ok('ticket checkout returns to the showing page', tp.get('success_url') === 'https://site.example/cinema/' + SH + '?session_id={CHECKOUT_SESSION_ID}')
r = await post(checkout, { showingId: SH })
ok('ticket checkout returns a stripe url', r.status === 200 && (await r.json()).url.includes('stripe'))
r = await post(checkout, { showingId: SH, price_cents: 1 })
ok('browser cannot change the ticket price', r.status === 200 && tp.get('line_items[0][price_data][unit_amount]') === '1200')
r = await post(checkout, { showingId: FREE })
ok('free showing cannot be bought', r.status === 400)
r = await post(checkout, { showingId: 'bad' })
ok('bad showing id rejected', r.status === 400)
db.festivals[0].payments_enabled = false
r = await post(checkout, { showingId: SH })
ok('tickets need payments turned on for the festival', r.status === 403)
db.festivals[0].payments_enabled = true
const tev = (id, pi) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { id, payment_intent: pi, payment_status: 'paid', amount_total: 1200, customer_details: { email: 'f@x.com' }, metadata: { showing_id: SH, festival_id: 'f1' } } } })
let b1 = tev('cs_ticket_first1234', 'pi_1')
r = await post(webhook, b1, { 'stripe-signature': sign(b1) })
ok('paid ticket creates a ticket with fee recorded', r.status === 200 && db.cinema_tickets.length === 1 && db.cinema_tickets[0].fee_cents === 60)
r = await post(webhook, b1, { 'stripe-signature': sign(b1) })
ok('replayed ticket payment does not sell a second seat', db.cinema_tickets.length === 1 && refunds.length === 0)
r = await post(checkout, { showingId: SH })
ok('sold out showing cannot start a new payment', r.status === 409)
let b2 = tev('cs_ticket_second123', 'pi_2')
r = await post(webhook, b2, { 'stripe-signature': sign(b2) })
ok('buyer who lost the last seat is refunded in full', r.status === 200 && db.cinema_tickets.length === 1 && refunds.length === 1 && refunds[0].includes('pi_2'))
r = await claim(new Request('https://site.example/x?session_id=cs_ticket_first1234'))
const cj = await r.json()
ok('claim returns the ticket code and showing', cj.status === 'ready' && cj.ticketCode === 'FV-TEST-0000-0001' && cj.showingId === SH)

// --- filmmaker submissions (entry fees)
const SUB = 'a1a1a1a1-aaaa-4aaa-8aaa-a1a1a1a1a1a1', SUBFREE = 'b2b2b2b2-bbbb-4bbb-8bbb-b2b2b2b2b2b2', SUBGONE = 'c3c3c3c3-cccc-4ccc-8ccc-c3c3c3c3c3c3'
const festPct = db.festivals[0].ticket_fee_pct
db.submissions = [
  { id: SUB, festival_id: 'f1', status: 'submitted', payment_status: 'unpaid', title: 'My Short' },
  { id: SUBFREE, festival_id: 'f1', status: 'submitted', payment_status: 'unpaid', title: 'Waived Film' },
  { id: SUBGONE, festival_id: 'f1', status: 'withdrawn', payment_status: 'unpaid', title: 'Gone' },
]
const requotes = []
const entryRefunds = []
const prevFetch2 = globalThis.fetch
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url))
  if (u.pathname.endsWith('/rpc/submission_requote')) {
    const a = JSON.parse(opts.body)
    requotes.push(a)
    const row = db.submissions.find((x) => x.id === a.p_id)
    if (!row || row.status === 'withdrawn') return new Response(JSON.stringify({ status: 'unavailable' }), { status: 200 })
    if (row.payment_status !== 'unpaid') return new Response(JSON.stringify({ status: 'paid' }), { status: 200 })
    if (a.p_code === 'FREEPASS') { row.payment_status = 'waived'; return new Response(JSON.stringify({ status: 'completed' }), { status: 200 }) }
    // the database decides the fee: 3500 cents (the regular tier), or half with a 50 percent code
    return new Response(JSON.stringify({ status: 'ok', amount_cents: a.p_code === 'HALF' ? 1750 : 3500, festival_id: 'f1', title: row.title, category: 'Short', festival_name: 'Fest' }), { status: 200 })
  }
  if (u.pathname.endsWith('/rpc/submission_mark_paid')) {
    const a = JSON.parse(opts.body)
    if (db.submissions.some((x) => x.stripe_session_id === a.p_session)) return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
    const row = db.submissions.find((x) => x.id === a.p_id)
    if (!row || row.status === 'withdrawn') return new Response(JSON.stringify({ status: 'unavailable' }), { status: 200 })
    if (row.payment_status !== 'unpaid') return new Response(JSON.stringify({ status: 'already_paid' }), { status: 200 })
    Object.assign(row, { payment_status: 'paid', stripe_session_id: a.p_session, amount_paid_cents: a.p_amount, fee_cents: a.p_fee })
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
  }
  if (u.host === 'api.stripe.com' && u.pathname.endsWith('/refunds')) { entryRefunds.push(String(opts.body)); return new Response('{}', { status: 200 }) }
  return prevFetch2(url, opts)
}
const sp = submissionCheckoutParams({ submission: SUB, quote: { amount_cents: 3500, title: 'My Short', category: 'Short' }, festival: { id: 'f1', name: 'Fest', slug: 'fest' }, siteUrl: 'https://site.example' })
ok('entry checkout uses the quoted amount and names the entry', sp.get('line_items[0][price_data][unit_amount]') === '3500' && sp.get('metadata[submission_id]') === SUB && sp.get('line_items[0][price_data][product_data][name]').includes('My Short'))
ok('entry checkout returns to the filmmaker area', sp.get('success_url') === 'https://site.example/filmmaker?session_id={CHECKOUT_SESSION_ID}')
r = await post(checkout, { submissionId: SUB })
ok('entry checkout returns a stripe url', r.status === 200 && (await r.json()).url.includes('stripe'))
r = await post(checkout, { submissionId: SUB, amount_cents: 1, price_cents: 1 })
ok('browser cannot send an entry price', r.status === 200 && requotes.every((x) => Object.keys(x).sort().join() === 'p_code,p_id'))
r = await post(checkout, { submissionId: SUB, code: 'HALF' })
ok('waiver code is checked by the database, not the browser', r.status === 200 && requotes.at(-1).p_code === 'HALF')
r = await post(checkout, { submissionId: SUBFREE, code: 'FREEPASS' })
ok('a 100 percent waiver completes the entry without a payment', r.status === 200 && (await r.json()).done === true && db.submissions[1].payment_status === 'waived')
r = await post(checkout, { submissionId: SUBGONE })
ok('withdrawn entry cannot be paid', r.status === 404)
r = await post(checkout, { submissionId: 'nope' })
ok('bad entry id rejected', r.status === 400)
r = await post(checkout, { submissionId: SUB, code: 'x'.repeat(41) })
ok('overlong code rejected', r.status === 400)
db.festivals[0].payments_enabled = false
r = await post(checkout, { submissionId: SUB })
ok('entry fees need payments turned on for the festival', r.status === 403)
db.festivals[0].payments_enabled = true
const eev = (id, pi, sub = SUB) => JSON.stringify({ type: 'checkout.session.completed', data: { object: { id, payment_intent: pi, payment_status: 'paid', amount_total: 3500, customer_details: { email: 'f@x.com' }, metadata: { submission_id: sub, festival_id: 'f1' } } } })
let e1 = eev('cs_entry_first12345', 'pi_e1')
r = await post(webhook, e1, { 'stripe-signature': sign(e1) })
ok('paid entry is recorded with the festival platform fee', r.status === 200 && db.submissions[0].payment_status === 'paid' && db.submissions[0].fee_cents === feeCents(3500, festPct) && db.submissions[0].amount_paid_cents === 3500)
r = await post(webhook, e1, { 'stripe-signature': sign(e1) })
ok('replayed entry payment is harmless and not refunded', r.status === 200 && entryRefunds.length === 0 && db.submissions[0].payment_status === 'paid')
let e2 = eev('cs_entry_second1234', 'pi_e2')
r = await post(webhook, e2, { 'stripe-signature': sign(e2) })
ok('a second payment for an already paid entry is refunded', r.status === 200 && entryRefunds.length === 1 && entryRefunds[0].includes('pi_e2'))
let e3 = eev('cs_entry_third12345', 'pi_e3', SUBGONE)
r = await post(webhook, e3, { 'stripe-signature': sign(e3) })
ok('payment for a withdrawn entry is refunded', r.status === 200 && entryRefunds.length === 2 && entryRefunds[1].includes('pi_e3'))
ok('unsigned entry payment rejected', (await post(webhook, e1, { 'stripe-signature': 'bad' })).status === 400)
r = await claim(new Request('https://site.example/x?session_id=cs_entry_first12345'))
const cj2 = await r.json()
ok('claim returns the paid entry', cj2.status === 'ready' && cj2.submissionId === SUB)

// --- fee tier rules and CSV export
const dayMs = 864e5, nowMs = Date.now()
const tiers = [
  { id: 'late', deadline: new Date(nowMs + 40 * dayMs).toISOString(), fee_cents: 5000, sort_order: 3 },
  { id: 'early', deadline: new Date(nowMs + 5 * dayMs).toISOString(), fee_cents: 2500, sort_order: 1 },
  { id: 'regular', deadline: new Date(nowMs + 20 * dayMs).toISOString(), fee_cents: 3500, sort_order: 2 },
]
ok('the earliest open deadline sets the fee', currentTier(tiers, nowMs).id === 'early')
ok('after the early deadline the regular fee applies', currentTier(tiers, nowMs + 6 * dayMs).id === 'regular')
ok('no fee applies after the last deadline', currentTier(tiers, nowMs + 50 * dayMs) === null)
ok('a step without a deadline is the last step', currentTier([{ id: 'open', deadline: null, fee_cents: 100, sort_order: 2 }, { id: 'e', deadline: new Date(nowMs + dayMs).toISOString(), fee_cents: 50, sort_order: 1 }], nowMs + 2 * dayMs).id === 'open')
ok('submissions follow the festival switch and dates', submissionState({ submissions_open: true }, nowMs) === 'open' && submissionState({ submissions_open: false }, nowMs) === 'closed' && submissionState({ submissions_open: true, submissions_opens_at: new Date(nowMs + dayMs).toISOString() }, nowMs) === 'not_open' && submissionState({ submissions_open: true, submissions_closes_at: new Date(nowMs - dayMs).toISOString() }, nowMs) === 'closed')
ok('money text', feeMoney(0) === 'Free' && feeMoney(3500) === '$35' && feeMoney(2550) === '$25.50')
ok('csv quotes values and defuses spreadsheet formulas', csvText([['a"b', '=HYPERLINK("x")', '+1', 'ok']]) === '"a""b","\'=HYPERLINK(""x"")","\'+1","ok"')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
