// GET /.netlify/functions/claim?session_id=cs_...  ->  { status: 'ready', code, festivalId, festivalSlug } | { status: 'pending' }
// The payment reference in the buyer's link is unguessable, like a receipt link.
import { env, json, sb } from '../lib/pay.mjs'

export default async (req) => {
  const e = env()
  if (!e.serviceKey || !e.supabaseUrl) return json({ status: 'error' }, 503)
  const sid = new URL(req.url).searchParams.get('session_id') || ''
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sid)) return json({ status: 'error' }, 400)

  const tk = await sb('cinema_tickets?stripe_session_id=eq.' + sid + '&select=code,showing_id')
  if (tk.ok && tk.data && tk.data[0]) return json({ status: 'ready', ticketCode: tk.data[0].code, showingId: tk.data[0].showing_id })
  const r = await sb('entitlements?stripe_session_id=eq.' + sid + '&status=eq.active&select=code,festival_id,event_id')
  const ent = r.ok && r.data && r.data[0]
  if (!ent) return json({ status: 'pending' })
  const f = await sb('festivals?id=eq.' + ent.festival_id + '&select=slug')
  return json({ status: 'ready', code: ent.code, festivalId: ent.festival_id, eventId: ent.event_id || null, festivalSlug: (f.ok && f.data && f.data[0] && f.data[0].slug) || null })
}
