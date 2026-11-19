// POST /.netlify/functions/virtual-start  { eventId, code, device }  ->  the screening result from the database
// Used for events with region rules. The viewer's country comes from Netlify's own location data, never from the
// request body, so it cannot be faked by the browser. (A VPN can still change a viewer's apparent location.)
import { env, json, sb } from '../lib/pay.mjs'

const UUID = /^[0-9a-f-]{36}$/i

export default async (req, context) => {
  if (req.method !== 'POST') return json({ status: 'error' }, 405)
  const e = env()
  if (!e.serviceKey || !e.supabaseUrl) return json({ status: 'geo_check_required' }, 503)

  let body
  try { body = await req.json() } catch { return json({ status: 'error' }, 400) }
  const { eventId, code, device } = body || {}
  if (!eventId || !UUID.test(eventId)) return json({ status: 'error' }, 400)
  if (String(code || '').length > 64 || String(device || '').length > 100) return json({ status: 'error' }, 400)

  const country = context && context.geo && context.geo.country && context.geo.country.code ? String(context.geo.country.code).toUpperCase() : null
  const r = await sb('rpc/virtual_start', {
    method: 'POST',
    body: { p_event: eventId, p_code: String(code || ''), p_device: String(device || ''), p_country: country },
  })
  if (!r.ok || !r.data) return json({ status: 'error' }, 502)
  return json(r.data)
}
