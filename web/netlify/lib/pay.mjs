// Shared helpers for the card-payment functions. No outside packages.
// Secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY) are read from Netlify environment
// variables only. They must never be written into the website code or committed.
import crypto from 'node:crypto'

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export function env() {
  return {
    stripeKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    siteUrl: process.env.URL,
  }
}

// Reads or writes the database with the server-only key (bypasses row level security, so only call it from here).
export async function sb(path, { method = 'GET', body, prefer } = {}) {
  const e = env()
  const res = await fetch(e.supabaseUrl + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: e.serviceKey,
      Authorization: 'Bearer ' + e.serviceKey,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  return { ok: res.ok, status: res.status, data }
}

// Stripe signs each webhook: header "t=<time>,v1=<hmac>". Verify it so nobody can fake a payment.
export function verifyStripeSignature(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300) {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).filter((p) => p.length === 2))
  const t = parts.t
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3))
  if (!t || sigs.length === 0) return false
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false
  const expected = crypto.createHmac('sha256', secret).update(t + '.' + rawBody).digest('hex')
  const exp = Buffer.from(expected, 'hex')
  return sigs.some((s) => {
    const got = Buffer.from(s, 'hex')
    return got.length === exp.length && crypto.timingSafeEqual(got, exp)
  })
}

// Access code like FV-3A9C-77B2-0E41 (48 random bits).
export function makeCode() {
  const h = crypto.randomBytes(6).toString('hex').toUpperCase()
  return 'FV-' + h.slice(0, 4) + '-' + h.slice(4, 8) + '-' + h.slice(8, 12)
}

export const feeCents = (amountCents, pct) => Math.round((Number(amountCents) * Number(pct || 0)) / 100)

// A ticket to a virtual theater showing. The price comes from the database.
export function ticketCheckoutParams({ showing, festival, siteUrl }) {
  const p = new URLSearchParams()
  p.set('mode', 'payment')
  p.set('line_items[0][quantity]', '1')
  p.set('line_items[0][price_data][currency]', 'usd')
  p.set('line_items[0][price_data][unit_amount]', String(showing.price_cents))
  p.set('line_items[0][price_data][product_data][name]', 'Ticket: ' + showing.title + ' - ' + festival.name)
  p.set('success_url', siteUrl + '/cinema/' + showing.id + '?session_id={CHECKOUT_SESSION_ID}')
  p.set('cancel_url', siteUrl + '/cinema/' + showing.id)
  p.set('metadata[showing_id]', showing.id)
  p.set('metadata[festival_id]', festival.id)
  return p
}

// The price always comes from the database, never from the browser.
export function checkoutParams({ product, festival, siteUrl }) {
  const p = new URLSearchParams()
  p.set('mode', 'payment')
  p.set('line_items[0][quantity]', '1')
  p.set('line_items[0][price_data][currency]', product.currency || 'usd')
  p.set('line_items[0][price_data][unit_amount]', String(product.price_cents))
  p.set('line_items[0][price_data][product_data][name]', product.name + ' - ' + festival.name)
  p.set('success_url', siteUrl + '/access?session_id={CHECKOUT_SESSION_ID}')
  p.set('cancel_url', siteUrl + '/festival/' + festival.slug)
  p.set('metadata[product_id]', product.id)
  p.set('metadata[festival_id]', festival.id)
  return p
}
