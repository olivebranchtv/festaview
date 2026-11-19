// POST /.netlify/functions/checkout  { productId }  ->  { url }  (Stripe Checkout page)
import { env, json, sb, checkoutParams, ticketCheckoutParams, submissionCheckoutParams } from '../lib/pay.mjs'

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const e = env()
  if (!e.stripeKey || !e.serviceKey || !e.supabaseUrl) return json({ error: 'Payments are not set up yet.' }, 503)

  let productId, showingId, submissionId, code
  try { const b = await req.json(); productId = b.productId; showingId = b.showingId; submissionId = b.submissionId; code = b.code } catch { return json({ error: 'Bad request' }, 400) }
  if (submissionId) return submissionCheckout(submissionId, code, e, req)
  if (showingId) return ticketCheckout(showingId, e, req)
  if (!productId || !/^[0-9a-f-]{36}$/i.test(productId)) return json({ error: 'Bad request' }, 400)

  const pr = await sb('products?id=eq.' + productId + '&active=eq.true&select=*')
  const product = pr.ok && pr.data && pr.data[0]
  if (!product) return json({ error: 'That item is not for sale.' }, 404)
  if (product.price_cents < 50) return json({ error: 'This item cannot be bought by card.' }, 400)

  const fr = await sb('festivals?id=eq.' + product.festival_id + '&select=id,slug,name,status,payments_enabled')
  const festival = fr.ok && fr.data && fr.data[0]
  if (!festival || festival.status !== 'published' || !festival.payments_enabled) return json({ error: 'Card payments are not available for this festival.' }, 403)

  const siteUrl = e.siteUrl || new URL(req.url).origin
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + e.stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: checkoutParams({ product, festival, siteUrl }).toString(),
  })
  const session = await res.json().catch(() => ({}))
  if (!res.ok || !session.url) return json({ error: 'Could not start the payment. Please try again.' }, 502)
  return json({ url: session.url })
}

// A ticket to a virtual theater showing.
async function ticketCheckout(showingId, e, req) {
  if (!/^[0-9a-f-]{36}$/i.test(showingId)) return json({ error: 'Bad request' }, 400)
  const r = await sb('cinema_showings?id=eq.' + showingId + '&status=eq.scheduled&select=id,title,price_cents,seats,festival_id,starts_at,runtime_min,qa_minutes')
  const showing = r.ok && r.data && r.data[0]
  if (!showing) return json({ error: 'That showing is not available.' }, 404)
  if (!(showing.price_cents >= 50)) return json({ error: 'This showing does not need a ticket.' }, 400)
  if (Date.now() > new Date(showing.starts_at).getTime() + (showing.runtime_min + showing.qa_minutes) * 60000) return json({ error: 'This showing has ended.' }, 400)
  const fr = await sb('festivals?id=eq.' + showing.festival_id + '&select=id,slug,name,status,payments_enabled')
  const festival = fr.ok && fr.data && fr.data[0]
  if (!festival || festival.status !== 'published' || !festival.payments_enabled) return json({ error: 'Card payments are not available for this festival.' }, 403)
  if (showing.seats != null) {
    const t = await sb('cinema_tickets?showing_id=eq.' + showing.id + '&select=id')
    if (t.ok && Array.isArray(t.data) && t.data.length >= showing.seats) return json({ error: 'Sorry, this showing is sold out.' }, 409)
  }
  const siteUrl = e.siteUrl || new URL(req.url).origin
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + e.stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: ticketCheckoutParams({ showing, festival, siteUrl }).toString(),
  })
  const session = await res.json().catch(() => ({}))
  if (!res.ok || !session.url) return json({ error: 'Could not start the payment. Please try again.' }, 502)
  return json({ url: session.url })
}

// A festival entry fee for a filmmaker's submission. The fee tier and any waiver code are worked out by the database.
async function submissionCheckout(submissionId, code, e, req) {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId) || String(code || '').length > 40) return json({ error: 'Bad request' }, 400)
  const rq = await sb('rpc/submission_requote', { method: 'POST', body: { p_id: submissionId, p_code: String(code || '') } })
  const q = rq.ok && rq.data
  if (!q) return json({ error: 'Could not start the payment. Please try again.' }, 502)
  if (q.status === 'unavailable') return json({ error: 'That entry is not available.' }, 404)
  if (q.status === 'paid') return json({ done: true })
  if (q.status === 'closed') return json({ error: 'This festival is no longer accepting submissions.' }, 400)
  if (q.status === 'completed') return json({ done: true })
  if (q.status !== 'ok' || !(q.amount_cents >= 50)) return json({ error: 'Could not start the payment. Please try again.' }, 502)
  const fr = await sb('festivals?id=eq.' + q.festival_id + '&select=id,slug,name,status,payments_enabled')
  const festival = fr.ok && fr.data && fr.data[0]
  if (!festival || festival.status !== 'published' || !festival.payments_enabled) return json({ error: 'Card payments are not available for this festival.' }, 403)
  const siteUrl = e.siteUrl || new URL(req.url).origin
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + e.stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: submissionCheckoutParams({ submission: submissionId, quote: q, festival, siteUrl }).toString(),
  })
  const session = await res.json().catch(() => ({}))
  if (!res.ok || !session.url) return json({ error: 'Could not start the payment. Please try again.' }, 502)
  return json({ url: session.url })
}
