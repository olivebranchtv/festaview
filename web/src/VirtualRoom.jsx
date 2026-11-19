import { useEffect, useMemo, useRef, useState } from 'react'
import Hls from 'hls.js'
import { startVirtual, listChat, postChat, reserveEvent, storedCode, storeCode, startCheckout, logView } from './data.js'
import { eventState, fmtWhen, kindLabel, regionText } from './virtual.js'
import { useSeo } from './seo.js'
import { eventPath } from './paths.js'

function attach(video, url, hlsRef) {
  if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
  if (/\.m3u8(\?|$)/i.test(url) && !video.canPlayType('application/vnd.apple.mpegurl') && Hls.isSupported()) {
    const h = new Hls()
    h.loadSource(url)
    h.attachMedia(video)
    hlsRef.current = h
  } else {
    video.src = url
  }
}

function priceText(p) {
  try { return (p.price_cents / 100).toLocaleString(undefined, { style: 'currency', currency: (p.currency || 'usd').toUpperCase() }) } catch { return '$' + (p.price_cents / 100).toFixed(2) }
}

function statusMessage(r) {
  switch (r.status) {
    case 'not_open': return 'This screening opens ' + fmtWhen(r.opens_at) + '.'
    case 'not_started': return 'The live event starts ' + fmtWhen(r.starts_at) + '. The room opens 15 minutes before.'
    case 'closed': return 'This screening has ended.'
    case 'code_required': return 'Enter a valid access code to watch.'
    case 'blocked': return 'This screening is not available in your region.'
    case 'geo_check_required': return 'We could not check your region just now. Please try again in a moment.'
    case 'full': return 'This screening is full.'
    case 'expired': return 'Your viewing window for this screening has ended.'
    case 'unlock_expired': return 'This ticket was not started in time and has expired.'
    case 'not_found': return 'This screening is not available.'
    default: return 'Something went wrong. Please try again.'
  }
}

// Chat and Q&A panel. The virtual theater passes its own loader and poster so the same panel serves both.
export function ChatPanel({ ev, code, loader, poster }) {
  const [msgs, setMsgs] = useState([])
  const [tab, setTab] = useState('chat')
  const [name, setName] = useState(() => { try { return localStorage.getItem('fv_name') || '' } catch { return '' } })
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const box = useRef(null)

  useEffect(() => {
    let stop = false
    const load = async () => { const m = await (loader ? loader(ev.id) : listChat(ev.id)); if (!stop) setMsgs(m) }
    load()
    const t = setInterval(load, 3000)
    return () => { stop = true; clearInterval(t) }
  }, [ev.id])
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [msgs, tab])

  const shown = msgs.filter((m) => (tab === 'chat' ? m.kind === 'chat' : m.kind === 'question'))
  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    try { localStorage.setItem('fv_name', name) } catch { /* ignore */ }
    const kind = tab === 'chat' ? 'chat' : 'question'
    const r = await (poster ? poster(name, text, kind) : postChat(ev, code, name, text, kind))
    if (r === 'ok') { setText(''); setErr(''); setMsgs(await (loader ? loader(ev.id) : listChat(ev.id))) }
    else setErr({ slow_down: 'Slow down a little.', not_watching: 'Press play first to join the chat.', closed: 'Chat is closed.', empty: 'Type a message first.' }[r] || 'Could not send. Try again.')
  }
  return (
    <aside className="chat" aria-label="Chat and questions">
      <div className="modes">
        <button className={tab === 'chat' ? 'on' : ''} onClick={() => setTab('chat')}>Chat</button>
        <button className={tab === 'q' ? 'on' : ''} onClick={() => setTab('q')}>Questions</button>
      </div>
      <div className="chat-list" ref={box}>
        {shown.length === 0 && <p className="note small">{tab === 'chat' ? 'No messages yet. Say hello.' : 'No questions yet. Ask the filmmakers.'}</p>}
        {shown.map((m) => (
          <p key={m.id} className={'chat-msg' + (m.answered ? ' answered' : '')}>
            <strong>{m.name}</strong> {m.body}{m.answered && <span className="pill published">answered</span>}
          </p>
        ))}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} aria-label="Your name" />
        <input placeholder={tab === 'chat' ? 'Say something' : 'Ask a question'} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} aria-label="Message" />
        <button className="btn" type="submit">{tab === 'chat' ? 'Send' : 'Ask'}</button>
      </form>
      {err && <p className="error small">{err}</p>}
    </aside>
  )
}

// The viewer's screening room: gate (access code, windows, region), then player and chat.
export default function VirtualRoom({ eventId, data }) {
  const ev = (data.events || []).find((e) => e.id === eventId)
  const fest = ev ? data.festivals.find((f) => f.id === ev.festival_id) : null
  useSeo(ev ? {
    title: ev.title + (fest ? ' | ' + fest.name : ''),
    description: (ev.description || 'Watch ' + ev.title + ' online.') + (fest ? ' A virtual event from ' + fest.name + '.' : ''),
    canonicalPath: eventPath(ev), image: ev.poster_url || undefined,
  } : { title: 'Screening not found', robots: 'noindex' })
  const [code, setCode] = useState(() => (ev ? storedCode(ev.festival_id) : ''))
  const [phase, setPhase] = useState('gate')
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [idx, setIdx] = useState(0)
  const [email, setEmail] = useState('')
  const [reserved, setReserved] = useState(false)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  const queue = useMemo(() => {
    if (!info) return []
    const q = []
    if (info.preroll_url) q.push({ kind: 'preroll', title: info.sponsor_name ? 'A message from ' + info.sponsor_name : 'Before the show', url: info.preroll_url })
    if (info.kind === 'live') { if (info.live_stream_url) q.push({ kind: 'live', title: info.title, url: info.live_stream_url }) }
    else for (const f of info.films || []) if (f.video_url) q.push({ kind: 'film', title: f.title, url: f.video_url, film: f })
    return q
  }, [info])

  useEffect(() => {
    if (phase !== 'playing' || !queue[idx]) return undefined
    const v = videoRef.current
    const item = queue[idx]
    attach(v, item.url, hlsRef)
    v.play().catch(() => {})
    const w = { secs: 0, last: 0 }
    const onTime = () => { const d = v.currentTime - w.last; if (d > 0 && d < 1.5) w.secs += d; w.last = v.currentTime }
    v.addEventListener('timeupdate', onTime)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      if (item.kind !== 'preroll' && w.secs >= 1) {
        logView({ ...(item.film ? { film_id: item.film.id } : {}), festival_id: ev.festival_id, seconds_watched: Math.min(21600, Math.round(w.secs)), source: 'virtual' })
      }
    }
  }, [phase, idx, queue]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (hlsRef.current) hlsRef.current.destroy() }, [])

  if (!ev) return <section className="block"><p className="note">This screening was not found. <a href="/">Back to Festaview</a></p></section>

  const st = eventState(ev)
  const eventProducts = (data.products || []).filter((p) => p.festival_id === ev.festival_id && (p.event_id === ev.id || (!p.film_id && !p.event_id)))

  const start = async () => {
    setBusy(true); setErr('')
    const r = await startVirtual(ev, code)
    setBusy(false)
    if (r.status === 'ok') {
      if (ev.access === 'ticketed') storeCode(ev.festival_id, code.trim().toUpperCase())
      setInfo(r); setIdx(0); setPhase('playing')
    } else setErr(statusMessage(r))
  }
  const buy = async (p) => { setErr(''); const r = await startCheckout(p.id); if (r.ok) window.location.href = r.url; else setErr(r.message) }
  const reserve = async (e) => { e.preventDefault(); const r = await reserveEvent(ev.id, email.trim()); if (r.ok) setReserved(true); else setErr('Could not save your email. Try again.') }
  const next = () => { if (idx + 1 < queue.length) setIdx(idx + 1); else setPhase('ended') }
  const cur = queue[idx]

  if (phase === 'playing' || phase === 'ended') {
    return (
      <section className="block room">
        <a className="back" href={fest ? '/festival/' + fest.slug : '/'}>{fest ? fest.name : 'Festaview'}</a>
        <div className={'room-grid' + (ev.chat_enabled ? ' with-chat' : '')}>
          <div>
            {phase === 'playing' && (
              <>
                <video ref={videoRef} className="player" controls={cur && cur.kind !== 'preroll'} playsInline onEnded={next} />
                <div className="room-bar">
                  <span>{cur && cur.kind === 'preroll' ? 'Sponsor message' : cur ? cur.title : ''}</span>
                  {cur && cur.kind === 'live' && <span className="pill live">Live</span>}
                  {queue.length > 1 && idx + 1 < queue.length && <small>Up next: {queue[idx + 1].title}</small>}
                </div>
              </>
            )}
            {phase === 'ended' && (
              <div className="access">
                <h3>Thanks for watching</h3>
                {info && info.watch_until && new Date(info.watch_until) > new Date()
                  ? <p className="note">You can watch again until {fmtWhen(info.watch_until)}.</p>
                  : <p className="note">This screening is over.</p>}
                <div className="actions">
                  {info && info.watch_until && new Date(info.watch_until) > new Date() && <button className="btn" onClick={() => { setIdx(0); setPhase('playing') }}>Watch again</button>}
                  <a className="btn ghost" href={fest ? '/festival/' + fest.slug : '/'}>Back to the festival</a>
                </div>
              </div>
            )}
            <h2 className="room-title">{ev.title}</h2>
            {info && info.watch_until && <p className="note small">Watch until {fmtWhen(info.watch_until)}.</p>}
            {ev.description && <p className="lede small">{ev.description}</p>}
          </div>
          {ev.chat_enabled && <ChatPanel ev={ev} code={code} />}
        </div>
      </section>
    )
  }

  const region = regionText(ev)
  return (
    <section className="block room">
      <a className="back" href={fest ? '/festival/' + fest.slug : '/'}>{fest ? fest.name : 'Festaview'}</a>
      <div className="gate" style={ev.poster_url ? { backgroundImage: 'linear-gradient(90deg, rgba(11,11,18,.95), rgba(11,11,18,.6)), url(' + ev.poster_url + ')' } : undefined}>
        <p className="eyebrow">{kindLabel[ev.kind]}{fest ? ' | ' + fest.name : ''}</p>
        <h1>{ev.title}</h1>
        <p className="lede">{ev.description}</p>
        <ul className="facts-line">
          <li><span className={'pill ' + (st.live ? 'live' : st.ended ? 'draft' : 'published')}>{st.label}</span></li>
          <li>{ev.access === 'ticketed' ? 'Ticketed' : 'Free'}</li>
          {ev.watch_hours && <li>{ev.watch_hours} hours to finish once you press play</li>}
          {ev.unlock_days && ev.access === 'ticketed' && <li>Press play within {ev.unlock_days} days of getting your ticket</li>}
          {ev.capacity && <li>Limited to {ev.capacity} viewers</li>}
          {region && <li>{region}</li>}
          {ev.chat_enabled && <li>Live chat and questions</li>}
        </ul>

        {ev.access === 'ticketed' && (
          <div className="access">
            {fest && fest.payments_enabled && eventProducts.length > 0 && (
              <div className="products">
                {eventProducts.map((p) => (
                  <div key={p.id} className="product">
                    <div><strong>{p.name}</strong>{p.description && <small>{p.description}</small>}</div>
                    <button className="btn" onClick={() => buy(p)}>{priceText(p)}</button>
                  </div>
                ))}
              </div>
            )}
            {fest && !fest.payments_enabled && fest.passes_url && <p><a className="btn" href={fest.passes_url} target="_blank" rel="noreferrer">Get tickets</a></p>}
            <input placeholder="Access code" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Access code" />
          </div>
        )}

        {!st.ended && <div className="actions"><button className="btn" onClick={start} disabled={busy || (ev.access === 'ticketed' && !code.trim())}>{busy ? 'Checking...' : ev.access === 'ticketed' ? 'Unlock and watch' : st.live ? 'Join the live event' : 'Start watching'}</button></div>}
        {st.ended && <p className="note">This screening has ended.</p>}
        {err && <p className="error">{err}</p>}

        {st.soon && !reserved && (
          <form className="inline-form" onSubmit={reserve}>
            <input type="email" placeholder="Email me when it opens" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email" />
            <button className="btn ghost" type="submit">Notify me</button>
          </form>
        )}
        {reserved && <p className="ok">Thanks. The festival will let you know when it opens.</p>}
      </div>
    </section>
  )
}
