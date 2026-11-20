// POST /.netlify/functions/roku-track  { type: 'rokuad', titleId, title, phase, kind, device }
// The Roku app reports each Adtelligent ad impression and completion against the title that was playing. The database looks up which
// festival owns that title and stores the event, so the festival's share of ad revenue can be worked out. Never blocks or errors the player.
const SB_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ckxwyhyjokpamgygdsoq.supabase.co'
const SB_KEY = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LyDs-buM_wSgTzJoM0ue7Q_ZTrrlizY'
const uuid = /^[0-9a-f-]{36}$/i

export default async (req) => {
  const quiet = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  if (req.method !== 'POST') return quiet()
  let b = {}
  try { b = JSON.parse(await req.text()) } catch { return quiet() }
  // BrightScript's FormatJson lower-cases object keys, so the Roku sends "titleid" not "titleId"
  if (b.titleId === undefined && b.titleid !== undefined) b.titleId = b.titleid
  if (b.type !== 'rokuad' || !uuid.test(b.titleId || '')) return quiet()
  const kind = String(b.kind || '').toLowerCase()
  if (kind !== 'impression' && kind !== 'complete') return quiet()
  try {
    await fetch(SB_URL() + '/rest/v1/rpc/roku_log_ad', {
      method: 'POST',
      headers: { apikey: SB_KEY(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_title: b.titleId, p_title_name: String(b.title || '').slice(0, 200), p_phase: String(b.phase || 'preroll'), p_kind: kind, p_device: b.device ? String(b.device).slice(0, 80) : null }),
    })
  } catch { /* reporting must never get in the way */ }
  return quiet()
}
