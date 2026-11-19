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
      code: makeCode(),
      email: (s.customer_details && s.customer_details.email) || null,
      source: 'stripe',
      amount_cents: amount,
      fee_cents: feeCents(amount, festival ? festival.ticket_fee_pct : 0),
      stripe_session_id: s.id,
      expires_at: product.expires_at || null,
    },
  })
  // If saving failed, answer with an error so Stripe tries again later.
  if (!ins.ok) return json({ error: 'Could not record the purchase' }, 500)
  return json({ received: true })
}
