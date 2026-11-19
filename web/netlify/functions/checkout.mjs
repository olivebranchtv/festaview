// POST /.netlify/functions/checkout  { productId }  ->  { url }  (Stripe Checkout page)
import { env, json, sb, checkoutParams } from '../lib/pay.mjs'

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const e = env()
  if (!e.stripeKey || !e.serviceKey || !e.supabaseUrl) return json({ error: 'Payments are not set up yet.' }, 503)

  let productId
  try { productId = (await req.json()).productId } catch { return json({ error: 'Bad request' }, 400) }
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
