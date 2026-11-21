// Roku ad waterfall for Festaview: ask Adtelligent first; if it returns no ad, play one of our own spots.
//
// The Roku app keeps asking for one VAST address. When that address is this function:
//   1. build Festaview's Adtelligent tag from the device details Roku passes in (the tag comes from ROKU_ADTELLIGENT_TAG)
//   2. fetch it with a short timeout. If the reply has an ad, relay it unchanged so Adtelligent's own tracking still fires.
//   3. otherwise play one of our own spots (Network console > Roku ads), picked at random
//   4. if there is nothing to play, return an empty VAST and the Roku skips the slot
//
// Our own spots carry NO tracking events on purpose: the TV reports every ad that plays against the title being watched, and
// the festival revenue share is worked out from those reports, so our own house ads must not count there. Slots are counted here instead.
// ?debug=1 shows which path was taken without counting; add &force=fallback to skip Adtelligent.
//
// Adtelligent tag: set ROKU_ADTELLIGENT_TAG in the Netlify environment (never put the zone or channel id in the code). It is the full
// Adtelligent address with these placeholders: {w} {h} {cb} {ua} {uip} {model} {store} {tid}. Until it is set, every slot goes straight to our own spots.

const SB_URL = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://ckxwyhyjokpamgygdsoq.supabase.co'
// The public (publishable) key, the same one the website and the Roku channel use. It is public by design.
const SB_KEY = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LyDs-buM_wSgTzJoM0ue7Q_ZTrrlizY'

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><VAST version="2.0"></VAST>'
const xml = (body, extra = {}) => new Response(body, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store', ...extra } })
export const hasAd = (b) => /<Ad[\s>]/i.test(b) && /<(InLine|Wrapper)[\s>]/i.test(b)

// Our uploaded spots point at Bunny's streaming playlist. Roku is safest with a plain MP4, and Bunny keeps one next to every playlist.
export const forRoku = (u) => String(u).replace(/(https:\/\/[^\s]+\.b-cdn\.net\/[0-9a-f-]+)\/playlist\.m3u8$/i, '$1/play_720p.mp4')
const cdata = (v) => '<![CDATA[' + String(v).split(']]>').join(']] >') + ']]>'
const hms = (s) => { const n = Math.max(1, Math.round(s)), p = (v) => String(v).padStart(2, '0'); return p(Math.floor(n / 3600)) + ':' + p(Math.floor((n % 3600) / 60)) + ':' + p(n % 60) }

async function get(url, ms, headers = {}) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms)
  try { const r = await fetch(url, { signal: c.signal, headers }); return { ok: r.ok, status: r.status, body: r.ok ? await r.text() : null } }
  catch { return { ok: false, status: 0, body: null } } finally { clearTimeout(t) }
}
async function rpc(name, args, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(SB_URL() + '/rest/v1/rpc/' + name, { method: 'POST', signal: c.signal, headers: { apikey: SB_KEY(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) })
    const txt = await r.text(); return r.ok && txt ? JSON.parse(txt) : null
  } catch { return null } finally { clearTimeout(t) }
}

// The ad for one of our own spots. No Impression address and no tracking events (see the note at the top).
export function spotVast(sp) {
  if (!/^https:\/\//i.test(sp.video_url || '')) return null
  const click = sp.click_url && /^https:\/\//i.test(sp.click_url) ? '<VideoClicks><ClickThrough>' + cdata(sp.click_url) + '</ClickThrough></VideoClicks>' : ''
  return '<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"><Ad id="spot-' + sp.id + '"><InLine><AdSystem>FestaviewFallback</AdSystem>' +
    '<AdTitle>' + cdata(sp.title || 'Spot') + '</AdTitle><Impression><![CDATA[]]></Impression><Creatives><Creative><Linear>' +
    '<Duration>' + hms(sp.duration_seconds) + '</Duration>' + click + '<MediaFiles><MediaFile delivery="progressive" type="video/mp4" width="1280" height="720">' + cdata(forRoku(sp.video_url)) + '</MediaFile></MediaFiles>' +
    '</Linear></Creative></Creatives></InLine></Ad></VAST>'
}

export default async (req) => {
  const q = new URL(req.url).searchParams
  const debug = q.get('debug') === '1'
  const pending = []
  const tally = (source, spot, ev) => { if (!debug) pending.push(rpc('roku_bump_ad', { p_source: source, p_spot: spot, p_event: ev }, 1000)) }
  const done = async (res) => { await Promise.allSettled(pending); return res }
  const enc = (v, d = '') => encodeURIComponent(v || d)
  const tagTemplate = process.env.ROKU_ADTELLIGENT_TAG || ''
  // For ?debug=1 only: did we ask Adtelligent, and what did it say?
  let adt = q.get('force') === 'fallback' ? 'skipped' : /^https:\/\//i.test(tagTemplate) ? 'asked' : 'tag not set'

  // 1) Adtelligent first (only when the Festaview tag has been set)
  if (q.get('force') !== 'fallback' && /^https:\/\//i.test(tagTemplate)) {
    const tag = tagTemplate.replace('{w}', enc(q.get('w'), '1920')).replace('{h}', enc(q.get('h'), '1080')).replace('{cb}', enc(q.get('cb'), String(Date.now())))
      .replace('{ua}', enc(q.get('ua') || req.headers.get('user-agent'))).replace('{uip}', enc(q.get('uip') || req.headers.get('x-nf-client-connection-ip')))
      .replace('{model}', enc(q.get('model'))).replace('{store}', enc(q.get('store'))).replace(/\{tid\}/g, enc(q.get('tid')))
    tally('adtelligent', '', 'request')
    const started = Date.now()
    const r = await get(tag, 3000, { 'User-Agent': q.get('ua') || 'Roku' })
    const filled = !!r.body && hasAd(r.body)
    adt = filled ? 'filled' : r.body ? 'no ads available' : 'no answer (status ' + r.status + ')'
    // Log line: result and size only, no addresses or device ids.
    console.log(JSON.stringify({ src: 'adtelligent', status: r.status, bytes: r.body ? r.body.length : 0, hasAd: filled, ms: Date.now() - started }))
    if (filled) { tally('adtelligent', '', 'filled'); return done(debug ? xml('<debug>adtelligent</debug>') : xml(r.body, { 'X-Ad-Source': 'adtelligent' })) }
  }

  // 2) One of our own spots
  const spots = await rpc('roku_spots', {}, 1500)
  if (Array.isArray(spots) && spots.length) {
    for (const sp of [...spots].sort(() => Math.random() - 0.5)) {
      const vast = spotVast(sp); if (!vast) continue
      console.log(JSON.stringify({ src: 'fallback', spot: 'spot-' + sp.id }))
      tally('fallback', 'spot-' + sp.id, 'filled')
      return done(debug ? xml('<debug>fallback: ' + sp.title + ' | adtelligent: ' + adt + '</debug>') : xml(vast, { 'X-Ad-Source': 'fallback' }))
    }
  }

  // 3) nothing to play
  return done(debug ? xml('<debug>none | adtelligent: ' + adt + '</debug>') : xml(EMPTY, { 'X-Ad-Source': 'none' }))
}
