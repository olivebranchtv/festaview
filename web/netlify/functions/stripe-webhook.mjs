// POST /.netlify/functions/stripe-webhook  (called by Stripe, not by the website)
// When a payment completes, creates the buyer's access code. Safe to receive twice: stripe_session_id is unique.
import { env, json, sb, verifyStripeSignature, makeCode, feeCents } from '../lib/pay.mjs'

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const e = env()
  if (!e.webhookSecret || !e.serviceKey || !e.supabaseUrl) return json({ error: 'Not configured' }, 503)

  const raw = await req.text()
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'), e.webhookSecret)) return json({ error: 'Bad signature' }, 400)

  let event
  try { event = JSON.parse(raw) } catch { return json({ error: 'Bad request' }, 400) }
  const handled = ['checkout.session.completed', 'checkout.session.async_payment_succeeded']
  if (!handled.includes(event.type)) return json({ received: true })

  const s = event.data && event.data.object
  if (!s || s.payment_status !== 'paid') return json({ received: true })
  const submissionId = s.metadata && s.metadata.submission_id
  if (submissionId) return payEntry(s, submissionId, e)
  const showingId = s.metadata && s.metadata.showing_id
  if (showingId) return sellTicket(s, showingId, e)
  const productId = s.metadata && s.metadata.product_id
  if (!productId) return json({ received: true })

  const pr = await sb('products?id=eq.' + productId + '&select=*')
  const product = pr.ok && pr.data && pr.data[0]
  if (!product) return json({ received: true })
  const fr = await sb('festivals?id=eq.' + product.festival_id + '&select=id,ticket_fee_pct')
  const festival = fr.ok && fr.data && fr.data[0]

  const amount = Number(s.amount_total || 0)
  const ins = await sb('entitlements?on_conflict=stripe_session_id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: {
      festival_id: product.festival_id,
      product_id: product.id,
      film_id: product.film_id || null,
      event_id: product.event_id || null,
      code: makeCode(),
      email: (s.customer_details && s.customer_details.email) || null,
      source: 'stripe',
      amount_cents: amount,
      // Box office cut: the title's own rate if the owner set one, otherwise the festival's default rate.
      fee_cents: feeCents(amount, product.fee_pct != null ? product.fee_pct : festival ? festival.ticket_fee_pct : 0),
      stripe_session_id: s.id,
      expires_at: product.expires_at || null,
    },
  })
  // If saving failed, answer with an error so Stripe tries again later.
  if (!ins.ok) return json({ error: 'Could not record the purchase' }, 500)
  return json({ received: true })
}

// A virtual theater ticket. If the last seat was taken by someone else while this buyer was paying, refund them in full.
async function sellTicket(s, showingId, e) {
  const sr = await sb('cinema_showings?id=eq.' + showingId + '&select=festival_id,fee_pct')
  const fid = sr.ok && sr.data && sr.data[0] && sr.data[0].festival_id
  const fr = fid ? await sb('festivals?id=eq.' + fid + '&select=ticket_fee_pct') : null
  const festPct = fr && fr.ok && fr.data && fr.data[0] ? fr.data[0].ticket_fee_pct : 0
  // Box office cut: the showing's own rate if the owner set one, otherwise the festival's default rate.
  const pct = sr.ok && sr.data && sr.data[0] && sr.data[0].fee_pct != null ? sr.data[0].fee_pct : festPct
  const amount = Number(s.amount_total || 0)
  const res = await fetch(e.supabaseUrl + '/rest/v1/rpc/cinema_sell_ticket', {
    method: 'POST',
    headers: { apikey: e.serviceKey, Authorization: 'Bearer ' + e.serviceKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_showing: showingId, p_session: s.id, p_email: (s.customer_details && s.customer_details.email) || '', p_amount: amount, p_fee: feeCents(amount, pct) }),
  })
  const out = await res.json().catch(() => null)
  if (!res.ok || !out) return json({ error: 'Could not record the ticket' }, 500)
  if ((out.status === 'sold_out' || out.status === 'unavailable') && s.payment_intent && e.stripeKey) {
    const rf = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + e.stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ payment_intent: s.payment_intent, reason: 'requested_by_customer' }).toString(),
    })
    if (!rf.ok) return json({ error: 'Could not refund' }, 500)
  }
  return json({ received: true })
}

// A festival entry fee. Safe to receive twice. If the entry was withdrawn or already paid another way, the payer is refunded.
async function payEntry(s, submissionId, e) {
  const sr = await sb('submissions?id=eq.' + submissionId + '&select=festival_id')
  const fid = sr.ok && sr.data && sr.data[0] && sr.data[0].festival_id
  const fr = fid ? await sb('festivals?id=eq.' + fid + '&select=ticket_fee_pct') : null
  const pct = fr && fr.ok && fr.data && fr.data[0] ? fr.data[0].ticket_fee_pct : 0
  const amount = Number(s.amount_total || 0)
  const r = await sb('rpc/submission_mark_paid', {
    method: 'POST',
    body: { p_id: submissionId, p_session: s.id, p_email: (s.customer_details && s.customer_details.email) || '', p_amount: amount, p_fee: feeCents(amount, pct) },
  })
  const out = r.ok && r.data
  if (!out) return json({ error: 'Could not record the entry payment' }, 500)
  if ((out.status === 'unavailable' || out.status === 'already_paid') && s.payment_intent && e.stripeKey) {
    const rf = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + e.stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ payment_intent: s.payment_intent, reason: 'requested_by_customer' }).toString(),
    })
    if (!rf.ok) return json({ error: 'Could not refund' }, 500)
  }
  return json({ received: true })
}
