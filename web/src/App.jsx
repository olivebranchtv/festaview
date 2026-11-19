import { lazy, Suspense, useEffect, useState } from 'react'
import { loadData, castVote, submitInquiry, unlockStream, storedCode, storeCode, startCheckout, claimAccess } from './data.js'
import { buildChannels, nowOn, schedule, clock } from './channels.js'
import { eventState, kindLabel } from './virtual.js'

// Loaded on demand so the public home page stays light (video player, admin and owner console are separate chunks).
const Admin = lazy(() => import('./Admin.jsx'))
const Network = lazy(() => import('./Network.jsx'))
const Player = lazy(() => import('./Player.jsx'))
const Theater = lazy(() => import('./Theater.jsx'))
const ChannelPlayer = lazy(() => import('./ChannelPlayer.jsx'))
const VirtualRoom = lazy(() => import('./VirtualRoom.jsx'))
import { CONTACT_EMAIL, ROKU_URL } from './config.js'

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

const bg = (color) => ({ background: 'linear-gradient(135deg, ' + (color || '#E6B34A') + ' 0%, #14141f 78%)' })

function RokuButton({ className }) {
  return ROKU_URL ? (
    <a className={'btn ' + (className || '')} href={ROKU_URL} target="_blank" rel="noreferrer">Get the Roku app</a>
  ) : (
    <span className={'btn disabled ' + (className || '')}>Roku app coming soon</span>
  )
}

function FilmCard({ film, festival, onOpen }) {
  return (
    <button className="card" onClick={() => onOpen(film)}>
      <div className="poster" style={film.poster_url ? undefined : bg(festival && festival.brand_color)}>
        {film.poster_url ? <img src={film.poster_url} alt="" loading="lazy" /> : <span>{film.title}</span>}
        {film.access === 'ticketed' && <span className="ticket-badge">Ticketed</span>}
      </div>
      <div className="card-title">{film.title}</div>
      <div className="card-meta">
        {[film.director, film.runtime_min ? film.runtime_min + ' min' : null, film.genre].filter(Boolean).join(' / ')}
      </div>
      {festival && <div className="card-fest">{festival.name}</div>}
    </button>
  )
}

function VoteButton({ film }) {
  const key = 'fv_voted'
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }
  const [state, setState] = useState(read().includes(film.id) ? 'done' : 'idle')
  const [msg, setMsg] = useState('')
  const vote = async () => {
    setState('busy')
    const r = await castVote(film)
    if (r.ok || r.duplicate) {
      try { localStorage.setItem(key, JSON.stringify([...read(), film.id])) } catch { /* ignore */ }
      setState('done')
      setMsg(r.duplicate ? 'You already voted for this film.' : 'Thanks for voting.')
    } else {
      setState('idle')
      setMsg('Voting is not available right now.')
    }
  }
  return (
    <span className="vote">
      <button className="btn ghost" onClick={vote} disabled={state !== 'idle'}>
        {state === 'done' ? 'Voted' : 'Vote Audience Choice'}
      </button>
      {msg && <small className="note">{msg}</small>}
    </span>
  )
}

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}

function InquiryForm() {
  const [f, setF] = useState({ festival_name: '', contact_name: '', email: '', message: '' })
  const [state, setState] = useState('idle')
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    setState('busy'); setErr('')
    const r = await submitInquiry({ ...f, contact_name: f.contact_name || null, message: f.message || null })
    if (r.ok) setState('done'); else { setState('idle'); setErr('Could not send. Please email us at ' + CONTACT_EMAIL) }
  }
  if (state === 'done') {
    return <div className="inquiry"><h3>Thank you</h3><p className="note">We received your details and will be in touch soon.</p></div>
  }
  return (
    <form className="inquiry" onSubmit={submit}>
      <h3>Become a founding festival</h3>
      <div className="two">
        <label className="field"><span>Festival name</span><input value={f.festival_name} onChange={set('festival_name')} required maxLength={200} /></label>
        <label className="field"><span>Your name</span><input value={f.contact_name} onChange={set('contact_name')} maxLength={200} /></label>
      </div>
      <label className="field"><span>Email</span><input type="email" value={f.email} onChange={set('email')} required maxLength={200} /></label>
      <label className="field"><span>Tell us about your festival</span><textarea rows={4} value={f.message} onChange={set('message')} maxLength={4000} /></label>
      {err && <p className="error">{err}</p>}
      <button className="btn" type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'Sending...' : 'Send'}</button>
    </form>
  )
}

function formatPrice(p) {
  try { return (p.price_cents / 100).toLocaleString(undefined, { style: 'currency', currency: (p.currency || 'usd').toUpperCase() }) } catch { return '$' + (p.price_cents / 100).toFixed(2) }
}

// Shown instead of the film when it is ticketed: enter an access code, or buy a pass or ticket.
function AccessPanel({ film, festival, products, onUnlocked }) {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = (products || []).filter((p) => p.festival_id === film.festival_id && (!p.film_id || p.film_id === film.id))
  const unlock = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg('')
    const url = await unlockStream(film.id, code)
    setBusy(false)
    if (url) { storeCode(film.festival_id, code.trim().toUpperCase()); onUnlocked(url) } else setMsg('That code did not work for this film.')
  }
  const buy = async (p) => {
    setMsg('')
    const r = await startCheckout(p.id)
    if (r.ok) window.location.href = r.url; else setMsg(r.message)
  }
  return (
    <div className="access">
      <h3>This is a ticketed screening</h3>
      {festival && festival.payments_enabled && mine.length > 0 && (
        <div className="products">
          {mine.map((p) => (
            <div key={p.id} className="product">
              <div><strong>{p.name}</strong>{p.description && <small>{p.description}</small>}</div>
              <button className="btn" onClick={() => buy(p)}>{formatPrice(p)}</button>
            </div>
          ))}
        </div>
      )}
      {festival && !festival.payments_enabled && festival.passes_url && (
        <p><a className="btn" href={festival.passes_url} target="_blank" rel="noreferrer">Get passes or tickets</a></p>
      )}
      <form className="inline-form" onSubmit={unlock}>
        <input placeholder="Have an access code?" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Access code" />
        <button className="btn ghost" type="submit" disabled={busy || !code.trim()}>{busy ? 'Checking...' : 'Unlock'}</button>
      </form>
      {msg && <p className="error">{msg}</p>}
    </div>
  )
}

function FilmModal({ film, festival, onClose, startMode, products }) {
  const [mode, setMode] = useState(startMode || 'film')
  const [stream, setStream] = useState(film.video_url || '')
  const locked = film.access === 'ticketed' && !stream
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  // A code entered earlier on this device unlocks the film automatically.
  useEffect(() => {
    if (film.access !== 'ticketed' || film.video_url) return
    const c = storedCode(film.festival_id)
    if (c) unlockStream(film.id, c).then((u) => { if (u) setStream(u) })
  }, [film.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={film.title}>
        {stream || film.trailer_url ? (
          <>
            {stream && film.trailer_url && (
              <div className="modes">
                <button className={mode === 'film' ? 'on' : ''} onClick={() => setMode('film')}>Film</button>
                <button className={mode === 'trailer' ? 'on' : ''} onClick={() => setMode('trailer')}>Trailer</button>
              </div>
            )}
            <Suspense fallback={<div className="modal-art" />}>
              {mode === 'trailer' || !stream
                ? <Player key="trailer" film={{ ...film, video_url: film.trailer_url, captions_url: null }} track={false} />
                : <Player key="film" film={{ ...film, video_url: stream }} track={!film.live} />}
            </Suspense>
          </>
        ) : (
          <div className="modal-art" style={film.poster_url ? undefined : bg(festival && festival.brand_color)}>
            {film.poster_url && <img src={film.poster_url} alt="" />}
          </div>
        )}
        <div className="modal-body">
          <button className="close" onClick={onClose} aria-label="Close">Close</button>
          <h2>{film.title}</h2>
          <p className="meta">
            {[film.year, film.runtime_min ? film.runtime_min + ' min' : null, film.genre, film.rating, film.country, film.language].filter(Boolean).join('  |  ')}
          </p>
          {film.director && <p className="meta">Directed by {film.director}</p>}
          {festival && <p className="meta">Official Selection, {festival.name}</p>}
          <p>{film.synopsis || 'Synopsis coming soon.'}</p>
          {locked && <AccessPanel film={film} festival={festival} products={products} onUnlocked={(u) => { setStream(u); setMode('film') }} />}
          <div className="actions">
            {!locked && film.access !== 'ticketed' && <RokuButton />}
            {festival && festival.voting_open && !film.live && <VoteButton film={film} />}
          </div>
          {film.access !== 'ticketed' && <p className="note small">Also available on the Festaview Roku channel.</p>}
        </div>
      </div>
    </div>
  )
}

function Header({ go }) {
  return (
    <header className="top">
      <a href="#/" className="brand"><span className="mark" aria-hidden="true" />FESTAVIEW</a>
      <nav className="nav">
        <button onClick={() => go('festivals')}>Festivals</button>
        <button onClick={() => go('guide')}>TV guide</button>
        <button onClick={() => go('virtual')}>Virtual</button>
        <button onClick={() => go('live')}>Live</button>
        <button onClick={() => go('devices')}>Watch</button>
        <button onClick={() => go('for-festivals')}>For festivals</button>
      </nav>
      <a className="admin-link" href="#/admin">Festival login</a>
    </header>
  )
}

function HeroVisual({ festivals }) {
  const tiles = festivals.slice(0, 6)
  while (tiles.length < 6) tiles.push(null)
  return (
    <div className="hv" aria-hidden="true">
      <div className="hv-screen">
        <div className="hv-top">
          <span className="hv-brand">FESTAVIEW</span>
          <span className="pill live">Live now</span>
        </div>
        <div className="hv-grid">
          {tiles.map((f, i) => (
            <div key={f ? f.id : 'n' + i} className="hv-tile" style={f ? bg(f.brand_color) : undefined}>
              {f && <span>{f.name}</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="hv-stand" />
    </div>
  )
}

function Hero({ go, stats, festivals }) {
  return (
    <section className="landing-hero">
      <div className="hero-inner hero-grid">
        <div className="hero-copy">
        <p className="eyebrow">Film festivals, all year</p>
        <h1>Every festival. Every screen.</h1>
        <p className="lede">
          Festaview brings the world's film festivals to your TV. Watch official selections, live premieres and award
          winners from festivals around the globe. Most films are free to watch.
        </p>
        <div className="actions">
          <RokuButton />
          <button className="btn ghost" onClick={() => go('festivals')}>Browse festivals</button>
        </div>
        <ul className="stats">
          <li><strong>{stats.festivals}</strong><span>{stats.festivals === 1 ? 'festival' : 'festivals'}</span></li>
          <li><strong>{stats.films}</strong><span>{stats.films === 1 ? 'film' : 'films'}</span></li>
          <li><strong>{stats.live}</strong><span>live {stats.live === 1 ? 'channel' : 'channels'}</span></li>
        </ul>
        </div>
        <HeroVisual festivals={festivals} />
      </div>
    </section>
  )
}

function LiveSection({ data }) {
  const feeds = data.feeds.filter((f) => f.is_live || f.is_replay_loop)
  return (
    <section id="live" className="block">
      <h2>Live and always on</h2>
      {feeds.length === 0 ? (
        <p className="note">Live premieres and 24/7 festival channels will appear here.</p>
      ) : (
        <div className="row">
          {feeds.map((f) => {
            const fest = data.festivals.find((x) => x.id === f.festival_id)
            return (
              <a key={f.id} className="live-card" href={fest ? '#/festival/' + fest.slug : '#/'} style={bg(fest && fest.brand_color)}>
                <span className={'pill ' + (f.is_live ? 'live' : '')}>{f.is_live ? 'Live now' : 'Replay channel'}</span>
                <strong>{f.name}</strong>
                {fest && <small>{fest.name}</small>}
              </a>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Featured({ data, onOpen }) {
  const films = data.films.slice(0, 12)
  return (
    <section className="block">
      <h2>Just added</h2>
      {films.length === 0 ? (
        <p className="note">Films are on their way. Check back soon.</p>
      ) : (
        <div className="row">
          {films.map((m) => (
            <FilmCard key={m.id} film={m} festival={data.festivals.find((f) => f.id === m.festival_id)} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  )
}

function FestivalGrid({ data }) {
  return (
    <section id="festivals" className="block">
      <h2>Festivals</h2>
      {data.festivals.length === 0 ? (
        <p className="note">No festivals yet.</p>
      ) : (
        <div className="grid">
          {data.festivals.map((f) => {
            const count = data.films.filter((m) => m.festival_id === f.id).length
            return (
              <a key={f.id} className="fest" href={'#/festival/' + f.slug}>
                <div className="fest-art" style={f.banner_url ? { backgroundImage: 'url(' + f.banner_url + ')' } : bg(f.brand_color)}>
                  {f.logo_url && <img src={f.logo_url} alt="" />}
                </div>
                <div className="fest-body">
                  <div className="fest-name">{f.name}</div>
                  <div className="fest-tag">{f.tagline}</div>
                  <div className="fest-count">{count} {count === 1 ? 'film' : 'films'}</div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Devices() {
  return (
    <section id="devices" className="block split">
      <div>
        <h2>Watch on the biggest screen</h2>
        <p className="lede">
          Festaview is built for the living room. Open the Roku channel and browse every festival, jump into a live
          premiere, or pick up a short before dinner.
        </p>
        <ul className="ticks">
          <li>Free and ad-supported, no subscription (some festivals add ticketed events)</li>
          <li>Live premieres, Q&amp;As and 24/7 replay channels</li>
          <li>Captions on films, so everyone can watch</li>
          <li>Festival-branded rows, so you always know whose selection you are watching</li>
        </ul>
        <div className="actions"><RokuButton /></div>
      </div>
      <div className="tv" aria-hidden="true">
        <div className="tv-screen">
          <span className="tv-brand">FESTAVIEW</span>
          <div className="tv-rows">
            <i /><i /><i />
          </div>
        </div>
        <div className="tv-stand" />
      </div>
    </section>
  )
}

function ForFestivals() {
  const [showForm, setShowForm] = useState(false)
  const items = [
    ['Your own channel', 'A branded category, a live channel and a white-label website, all in sync.'],
    ['A shared audience', 'Viewers who come for one festival discover yours, and the reverse.'],
    ['You keep 80%', 'Festivals receive 80% of the ad revenue their content earns, with transparent reporting.'],
    ['Filmmakers get paid', 'Share earnings with your selected filmmakers and show them their viewing data.'],
    ['Premiere protection', 'Date and region windows keep your premieres exclusive until you say so.'],
    ['Year-round presence', 'Keep your official selections streaming long after closing night.'],
  ]
  return (
    <section id="for-festivals" className="block pitch">
      <h2>Run a film festival?</h2>
      <p className="lede">Your festival runs for a week. Your audience should be there all year. Join Festaview as a founding festival.</p>
      <div className="benefits">
        {items.map(([t, d]) => (
          <div key={t} className="benefit"><strong>{t}</strong><p>{d}</p></div>
        ))}
      </div>
      <div className="actions">
        <button className="btn" onClick={() => setShowForm(true)}>Become a founding festival</button>
        <a className="btn ghost" href="#/admin">Festival login</a>
      </div>
      {showForm && <InquiryForm />}
    </section>
  )
}

function Faq() {
  const q = [
    ['What is Festaview?', 'A streaming network for film festivals. Each festival gets its own channel and page, and viewers can browse them all in one place.'],
    ['Does it cost anything to watch?', 'Most films and channels are free, supported by ads. Some festivals also sell passes or tickets for premieres and theater screenings. Those are shown on the festival\'s page.'],
    ['Where can I watch?', 'On Roku today, and on the web. More TV platforms are planned.'],
    ['How do festivals earn money?', 'Festivals receive 80% of the ad revenue their content earns. Festivals can also link to their own pass and ticket sales.'],
    ['What about filmmakers?', 'Films appear only with the filmmaker\'s agreement. Festivals can share earnings with filmmakers and show them viewing data.'],
    ['How do I add my festival?', 'Get in touch with us using the button above and we will set up your channel and page.'],
  ]
  return (
    <section className="block faq">
      <h2>Questions</h2>
      {q.map(([a, b]) => (
        <details key={a}><summary>{a}</summary><p>{b}</p></details>
      ))}
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div>
        <span className="brand"><span className="mark" aria-hidden="true" />FESTAVIEW</span>
        <p className="note">Every festival. Every screen.</p>
      </div>
      <div className="footer-links">
        <a href={'mailto:' + CONTACT_EMAIL}>Contact</a>
        <a href="#/admin">Festival login</a>
      </div>
      <p className="note small">&copy; {new Date().getFullYear()} Festaview</p>
    </footer>
  )
}

// Re-renders on a timer so "now playing" stays current.
function useTick(ms) {
  const [, set] = useState(0)
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t) }, [ms])
}

function EventCard({ ev, fest }) {
  const st = eventState(ev)
  return (
    <a className="event" href={'#/virtual/' + ev.id}>
      <div className="event-art" style={ev.poster_url ? { backgroundImage: 'url(' + ev.poster_url + ')' } : bg(fest && fest.brand_color)}>
        <span className={'pill ' + (st.live ? 'live' : '')}>{st.live ? 'Live now' : kindLabel[ev.kind]}</span>
      </div>
      <div className="event-body">
        <div className="event-title">{ev.title}</div>
        {fest && <div className="event-meta">{fest.name}</div>}
        <div className="event-when">{st.label}  |  {ev.access === 'ticketed' ? 'Ticketed' : 'Free'}</div>
      </div>
    </a>
  )
}

// Upcoming and current virtual screenings, programs and live events (all festivals, or just one).
function VirtualSection({ data, festivalId }) {
  useTick(30000)
  const rank = (e) => { const s = eventState(e); return s.live ? 0 : s.soon ? 1 : 2 }
  const events = (data.events || [])
    .filter((e) => (!festivalId || e.festival_id === festivalId) && !eventState(e).ended)
    .sort((a, b) => rank(a) - rank(b) || new Date(a.starts_at || a.available_from || 0) - new Date(b.starts_at || b.available_from || 0))
  if (!events.length) return null
  return (
    <section id="virtual" className="block">
      <h2>Virtual cinema</h2>
      <p className="note guide-note">Screenings, programs and live events you can watch from home.</p>
      <div className="event-grid">
        {events.map((e) => <EventCard key={e.id} ev={e} fest={data.festivals.find((f) => f.id === e.festival_id)} />)}
      </div>
    </section>
  )
}

function ChannelRow({ ch, onChannel }) {
  const n = nowOn(ch)
  const pct = Math.min(100, (n.offset / n.item.duration) * 100)
  return (
    <button className="guide-row" onClick={() => onChannel(ch.id)}>
      <span className="ch-num" style={{ background: ch.color }}>{ch.number}</span>
      <span className="ch-main">
        <span className="ch-name"><span className="pill live">Live</span> {ch.name}</span>
        <span className="ch-now">{n.item.title}</span>
        <span className="ch-bar"><i style={{ width: pct + '%', background: ch.color }} /></span>
      </span>
      <span className="ch-next">{clock(n.remaining)} left{ch.items.length > 1 ? ' | Up next: ' + n.next.title : ''}</span>
    </button>
  )
}

function TvGuide({ data, onChannel }) {
  useTick(30000)
  const chans = buildChannels(data)
  if (!chans.length) return null
  return (
    <section id="guide" className="block">
      <h2>TV guide</h2>
      <p className="note guide-note">Festival channels play on a schedule. Tune in and you join whatever is on right now.</p>
      <div className="guide-list">{chans.map((c) => <ChannelRow key={c.id} ch={c} onChannel={onChannel} />)}</div>
    </section>
  )
}

function Hub({ data, go, onOpen, onChannel }) {
  const stats = {
    festivals: data.festivals.length,
    films: data.films.length,
    live: data.feeds.filter((f) => f.is_live || f.is_replay_loop).length,
  }
  return (
    <>
      <Hero go={go} stats={stats} festivals={data.festivals} />
      <VirtualSection data={data} />
      <TvGuide data={data} onChannel={onChannel} />
      <LiveSection data={data} />
      <Featured data={data} onOpen={onOpen} />
      <FestivalGrid data={data} />
      <Devices />
      <ForFestivals />
      <Faq />
    </>
  )
}

const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

function downloadIcs(festival, items, venues) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Festaview//Screenings//EN', 'CALSCALE:GREGORIAN']
  for (const s of items) {
    const v = venues.find((x) => x.id === s.venue_id)
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + s.id + '@festaview',
      'DTSTAMP:' + icsStamp(new Date().toISOString()),
      'DTSTART:' + icsStamp(s.starts_at),
      'DTEND:' + icsStamp(s.ends_at),
      'SUMMARY:' + icsText((s.title || 'Screening') + ' - ' + festival.name),
      'LOCATION:' + icsText(v ? [v.name, v.address, v.city].filter(Boolean).join(', ') : ''),
      s.ticket_url ? 'URL:' + s.ticket_url : 'DESCRIPTION:' + icsText(festival.name),
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }))
  a.download = festival.slug + '-screenings.ics'
  a.click()
  URL.revokeObjectURL(a.href)
}

function TheaterScreenings({ fest, data }) {
  const items = (data.screenings || []).filter((s) => s.festival_id === fest.id)
  if (!items.length) return null
  return (
    <section className="block">
      <h2>In theaters</h2>
      <ul className="schedule">
        {items.map((s) => {
          const v = (data.venues || []).find((x) => x.id === s.venue_id)
          return (
            <li key={s.id}>
              <span className="when">{fmtWhen(s.starts_at)}</span>
              <strong>{s.title || 'Screening'}</strong>
              <small>{v ? [v.name, v.city].filter(Boolean).join(', ') : 'Venue to be announced'}{s.room ? ' | ' + s.room : ''}</small>
              {s.ticket_url && <a className="btn ghost small" href={s.ticket_url} target="_blank" rel="noreferrer">Tickets</a>}
            </li>
          )
        })}
      </ul>
      <div className="actions"><button className="btn ghost" onClick={() => downloadIcs(fest, items, data.venues || [])}>Add all to calendar</button></div>
    </section>
  )
}

function accentText(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#14110a'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#14110a' : '#ffffff'
}

function fmtDates(a, b) {
  if (!a) return ''
  const d1 = new Date(a + 'T12:00:00')
  const d2 = b ? new Date(b + 'T12:00:00') : null
  const md = { month: 'long', day: 'numeric' }
  if (!d2 || +d1 === +d2) return d1.toLocaleDateString(undefined, { ...md, year: 'numeric' })
  const same = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()
  return d1.toLocaleDateString(undefined, md) + ' - ' + (same ? d2.getDate() : d2.toLocaleDateString(undefined, md)) + ', ' + d2.getFullYear()
}

// A festival's own landing page: branded hero, spotlight film, about, live, schedule, theaters and the full selection.
// Passes and tickets for one festival, plus a box to enter an access code.
function PassesSection({ fest, products, ticketed }) {
  const [msg, setMsg] = useState('')
  const [code, setCode] = useState('')
  const [ok, setOk] = useState(false)
  const buy = async (p) => {
    setMsg('')
    const r = await startCheckout(p.id)
    if (r.ok) window.location.href = r.url; else setMsg(r.message)
  }
  const apply = async (e) => {
    e.preventDefault()
    setMsg(''); setOk(false)
    const c = code.trim().toUpperCase()
    if (ticketed.length) {
      const results = await Promise.all(ticketed.map((m) => unlockStream(m.id, c)))
      if (!results.some(Boolean)) { setMsg('That code did not work.'); return }
    }
    storeCode(fest.id, c)
    setOk(true)
  }
  return (
    <section id="passes" className="block">
      <h2>Passes and tickets</h2>
      {products.length > 0 && (
        <div className="products wide">
          {products.map((p) => (
            <div key={p.id} className="product">
              <div><strong>{p.name}</strong>{p.description && <small>{p.description}</small>}{p.film_id && <small>One film</small>}</div>
              {fest.payments_enabled ? <button className="btn" onClick={() => buy(p)}>{formatPrice(p)}</button> : <span className="price">{formatPrice(p)}</span>}
            </div>
          ))}
        </div>
      )}
      {!fest.payments_enabled && fest.passes_url && <p><a className="btn" href={fest.passes_url} target="_blank" rel="noreferrer">Get passes or tickets</a></p>}
      <form className="inline-form" onSubmit={apply}>
        <input placeholder="Have an access code?" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Access code" />
        <button className="btn ghost" type="submit" disabled={!code.trim()}>Apply code</button>
      </form>
      {msg && <p className="error">{msg}</p>}
      {ok && <p className="ok">Code accepted. Ticketed films are unlocked on this device.</p>}
    </section>
  )
}

// Shown after a card payment: fetches the access code the payment created and remembers it on this device.
function AccessClaim({ hash }) {
  const sid = new URLSearchParams((hash.split('?')[1]) || '').get('session_id')
  const [r, setR] = useState({ status: 'pending' })
  useEffect(() => {
    if (!sid) return undefined
    let stop = false
    let tries = 0
    const tick = async () => {
      const j = await claimAccess(sid)
      if (stop) return
      if (j.status === 'ready') { storeCode(j.festivalId, j.code); setR(j); return }
      tries += 1
      if (tries < 12) setTimeout(tick, 2500); else setR({ status: 'timeout' })
    }
    tick()
    return () => { stop = true }
  }, [sid])
  return (
    <section className="block claim">
      <h2>Your access</h2>
      {!sid && <p className="note">This page needs a payment reference. <a href="#/">Back to Festaview</a></p>}
      {sid && r.status === 'pending' && <p className="note">Confirming your payment...</p>}
      {r.status === 'ready' && (
        <>
          <p className="ok">Payment received. Your access code:</p>
          <p className="code">{r.code}</p>
          <p className="note">Keep this code. It is already saved on this device, and you can enter it on any device to watch.</p>
          <div className="actions">
            {r.eventId && <a className="btn" href={'#/virtual/' + r.eventId}>Go to your screening</a>}
            {r.festivalSlug && <a className={'btn' + (r.eventId ? ' ghost' : '')} href={'#/festival/' + r.festivalSlug}>Go to the festival</a>}
          </div>
        </>
      )}
      {(r.status === 'timeout' || r.status === 'error') && <p className="error">We could not confirm your payment yet. If you were charged, contact the festival with your receipt.</p>}
    </section>
  )
}

function Festival({ data, slug, onOpen, onChannel }) {
  useTick(30000)
  const [genre, setGenre] = useState('')
  const [q, setQ] = useState('')
  const fest = data.festivals.find((f) => f.slug === slug)
  if (!fest) return <section className="block"><p className="note">Festival not found. <a href="#/">Back to all festivals</a></p></section>

  const films = data.films.filter((m) => m.festival_id === fest.id)
  const feeds = data.feeds.filter((l) => l.festival_id === fest.id)
  const venues = (data.venues || []).filter((v) => v.festival_id === fest.id)
  const theaterShows = (data.screenings || []).filter((s) => s.festival_id === fest.id)
  const feedIds = feeds.map((l) => l.id)
  const sched = (data.schedule || []).filter((s) => feedIds.includes(s.live_feed_id))
  const accent = fest.brand_color || '#E6B34A'
  const featured = films.find((m) => m.poster_url) || films[0]
  const backdrop = fest.banner_url || (featured && featured.poster_url) || ''
  const genres = [...new Set(films.map((m) => m.genre).filter(Boolean))]
  const shown = films.filter((m) => (!genre || m.genre === genre) && (!q || (m.title + ' ' + (m.director || '')).toLowerCase().includes(q.toLowerCase())))
  const totalMin = films.reduce((a, m) => a + (Number(m.runtime_min) || 0), 0)
  const dates = fmtDates(fest.starts_on, fest.ends_on)
  const to = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const fProducts = (data.products || []).filter((p) => p.festival_id === fest.id)
  const ticketedFilms = films.filter((m) => m.access === 'ticketed')
  const showPasses = fProducts.length > 0 || ticketedFilms.length > 0 || !!fest.passes_url
  const hasEvents = (data.events || []).some((e) => e.festival_id === fest.id && !eventState(e).ended)
  const chan = buildChannels(data).find((c) => c.festivalId === fest.id)
  const nav = [['about', 'About'], hasEvents ? ['virtual', 'Virtual'] : null, showPasses ? ['passes', 'Passes'] : null, chan ? ['channel', 'Channel'] : null, films.length ? ['selection', 'Films'] : null, feeds.length ? ['live', 'Live'] : null, sched.length ? ['schedule', 'Schedule'] : null, theaterShows.length ? ['theaters', 'In theaters'] : null].filter(Boolean)
  const meta = (m) => [m.year, m.runtime_min ? m.runtime_min + ' min' : null, m.genre, m.rating].filter(Boolean).join('  |  ')

  return (
    <div className="fp" style={{ '--accent': accent, '--gold': accent, '--accent-text': accentText(accent) }}>
      <section className="fp-hero">
        <div className="fp-backdrop" style={backdrop ? { backgroundImage: 'url(' + backdrop + ')' } : bg(accent)} />
        <div className="fp-shade" />
        <div className="fp-hero-inner">
          <a className="back" href="#/">All festivals</a>
          {fest.logo_url && <img className="fest-logo" src={fest.logo_url} alt="" />}
          {(dates || fest.location) && <p className="eyebrow">{[dates, fest.location].filter(Boolean).join('   |   ')}</p>}
          <h1>{fest.name}</h1>
          {fest.tagline && <p className="lede">{fest.tagline}</p>}
          <div className="actions">
            {featured && featured.video_url && <button className="btn" onClick={() => onOpen(featured)}>Watch now</button>}
            {featured && !featured.video_url && <button className="btn" onClick={() => to('selection')}>See the films</button>}
            {fest.passes_url && <a className="btn ghost" href={fest.passes_url} target="_blank" rel="noreferrer">Get passes</a>}
            <RokuButton className="ghost" />
          </div>
          <ul className="stats">
            <li><strong>{films.length}</strong><span>{films.length === 1 ? 'film' : 'films'}</span></li>
            {totalMin > 0 && <li><strong>{totalMin >= 120 ? Math.round(totalMin / 60) : totalMin}</strong><span>{totalMin >= 120 ? 'hours of film' : 'minutes of film'}</span></li>}
            {feeds.length > 0 && <li><strong>{feeds.length}</strong><span>live {feeds.length === 1 ? 'channel' : 'channels'}</span></li>}
            {venues.length > 0 && <li><strong>{venues.length}</strong><span>{venues.length === 1 ? 'theater' : 'theaters'}</span></li>}
          </ul>
        </div>
      </section>

      <nav className="fp-nav" aria-label="Festival sections">
        {nav.map(([id, label]) => <button key={id} onClick={() => to(id)}>{label}</button>)}
        {fest.passes_url && <a href={fest.passes_url} target="_blank" rel="noreferrer">Passes</a>}
      </nav>

      {featured && (
        <section className="block fp-spot">
          <div className="spot-art">
            {featured.poster_url ? <img src={featured.poster_url} alt="" /> : <div className="spot-fallback" style={bg(accent)}>{featured.title}</div>}
          </div>
          <div className="spot-copy">
            <p className="eyebrow">Spotlight</p>
            <h2>{featured.title}</h2>
            {meta(featured) && <p className="meta">{meta(featured)}</p>}
            {featured.director && <p className="meta">Directed by {featured.director}</p>}
            <p className="lede small">{featured.synopsis || 'An Official Selection of ' + fest.name + '.'}</p>
            <div className="actions">
              {featured.video_url && <button className="btn" onClick={() => onOpen(featured)}>Watch film</button>}
              {featured.trailer_url && <button className="btn ghost" onClick={() => onOpen(featured, 'trailer')}>Watch trailer</button>}
              {!featured.video_url && <button className="btn" onClick={() => onOpen(featured)}>Details</button>}
            </div>
          </div>
        </section>
      )}

      {hasEvents && <VirtualSection data={data} festivalId={fest.id} />}

      {showPasses && <PassesSection fest={fest} products={fProducts} ticketed={ticketedFilms} />}

      {chan && (
        <section id="channel" className="block">
          <h2>{fest.name} Channel</h2>
          <div className="guide-list"><ChannelRow ch={chan} onChannel={onChannel} /></div>
          {(() => {
            const next = schedule(chan, 4).slice(1)
            if (!next.length || chan.items.length < 2) return null
            return (
              <ul className="schedule">
                {next.map((p, i) => (
                  <li key={i}><span className="when">{new Date(p.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span><strong>{p.item.title}</strong></li>
                ))}
              </ul>
            )
          })()}
        </section>
      )}

      <section id="about" className="block fp-about">
        <div>
          <h2>About the festival</h2>
          <p className="lede">{fest.description || fest.name + ' celebrates independent film. Browse the Official Selection, catch live events and find a screening near you.'}</p>
        </div>
        <dl className="facts">
          {dates && <><dt>When</dt><dd>{dates}</dd></>}
          {fest.location && <><dt>Where</dt><dd>{fest.location}</dd></>}
          <dt>Films</dt><dd>{films.length}</dd>
          {venues.length > 0 && <><dt>Theaters</dt><dd>{venues.map((v) => v.name).join(', ')}</dd></>}
          {fest.website && <><dt>Website</dt><dd><a href={fest.website} target="_blank" rel="noreferrer">{fest.website.replace(/^https?:\/\//, '')}</a></dd></>}
        </dl>
      </section>

      {films.length > 0 && (
        <section id="selection" className="block">
          <div className="fp-head">
            <h2>Official Selection</h2>
            <input className="fp-search" placeholder="Search films" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search films" />
          </div>
          {genres.length > 1 && (
            <div className="chips">
              <button className={'chip' + (!genre ? ' on' : '')} onClick={() => setGenre('')}>All</button>
              {genres.map((g) => <button key={g} className={'chip' + (genre === g ? ' on' : '')} onClick={() => setGenre(g)}>{g}</button>)}
            </div>
          )}
          {shown.length === 0 ? <p className="note">No films match.</p> : (
            <div className="fp-grid">{shown.map((m) => <FilmCard key={m.id} film={m} festival={fest} onOpen={onOpen} />)}</div>
          )}
        </section>
      )}

      {films.length === 0 && (
        <section className="block"><h2>Official Selection</h2><p className="note">This festival's films are coming soon.</p></section>
      )}

      {feeds.length > 0 && (
        <section id="live" className="block">
          <h2>Live channel</h2>
          <div className="row">
            {feeds.map((l) => (
              <button
                key={l.id}
                className={'live-card' + (l.stream_url ? ' playable' : '')}
                style={l.poster_url ? { backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,.75), rgba(0,0,0,.1)), url(' + l.poster_url + ')', backgroundSize: 'cover' } : bg(accent)}
                onClick={() => l.stream_url && onOpen({ id: 'live-' + l.id, festival_id: l.festival_id, title: l.name, synopsis: l.is_live ? 'Live now on ' + fest.name + '.' : 'Always-on replay channel from ' + fest.name + '.', video_url: l.stream_url, poster_url: l.poster_url, live: true })}
              >
                <span className={'pill ' + (l.is_live ? 'live' : '')}>{l.is_live ? 'Live now' : 'Replay channel'}</span>
                <strong>{l.name}</strong>
                <small>{l.stream_url ? 'Click to watch' : 'Stream starts soon'}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {sched.length > 0 && (
        <section id="schedule" className="block">
          <h2>Coming up</h2>
          <ul className="schedule">
            {sched.map((s) => {
              const film = data.films.find((x) => x.id === s.film_id)
              const feed = feeds.find((l) => l.id === s.live_feed_id)
              return (
                <li key={s.id}>
                  <span className="when">{fmtWhen(s.starts_at)}</span>
                  <strong>{s.title || (film && film.title) || 'To be announced'}</strong>
                  {feed && <small>{feed.name}</small>}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <div id="theaters"><TheaterScreenings fest={fest} data={data} /></div>

      <section className="block">
        <div className="fp-cta">
          <div>
            <h2>Watch {fest.name} on your TV</h2>
            <p className="lede small">Stream the Official Selection and live events on the Festaview Roku channel.</p>
          </div>
          <RokuButton />
        </div>
      </section>
    </div>
  )
}

export default function App() {
  const hash = useHashRoute()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  // Close any open film popup when the page changes.
  const [channel, setChannel] = useState(null)
  useEffect(() => { setOpen(null); setChannel(null) }, [hash])

  useEffect(() => {
    loadData().then(setData).catch(() => setError('Festaview is having trouble loading right now. Please refresh in a moment.'))
  }, [])

  const m = hash.match(/^#\/festival\/(.+)$/)
  const isAdmin = hash.startsWith('#/admin')
  const isNetwork = hash.startsWith('#/network')
  const isTheater = hash.startsWith('#/theater')
  const isAccess = hash.startsWith('#/access')
  const isVirtual = hash.startsWith('#/virtual/')
  const isPublic = !isAdmin && !isNetwork && !isTheater && !isAccess && !isVirtual

  const go = (id) => {
    const scroll = () => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }) }
    if (m || isAdmin) { window.location.hash = '#/'; setTimeout(scroll, 80) } else scroll()
  }

  const [openMode, setOpenMode] = useState('film')
  const openFilm = (film, mode) => { setOpenMode(mode || 'film'); setOpen(film) }
  const openFest = open && data ? data.festivals.find((f) => f.id === open.festival_id) : null

  return (
    <div className="app">
      {!isTheater && <Header go={go} />}
      <main>
        <Suspense fallback={<p className="note pad">Loading...</p>}>
          {isAdmin && <div className="wrap-admin"><Admin /></div>}
          {isNetwork && <div className="wrap-admin"><Network /></div>}
          {isTheater && <Theater slug={decodeURIComponent(hash.replace('#/theater/', ''))} />}
        </Suspense>
        {isAccess && <AccessClaim hash={hash} />}
        {isVirtual && !data && !error && <p className="note pad">Loading...</p>}
        {isVirtual && error && <p className="note pad">{error}</p>}
        {isVirtual && data && <Suspense fallback={<p className="note pad">Loading...</p>}><VirtualRoom key={hash} eventId={hash.replace('#/virtual/', '')} data={data} /></Suspense>}
        {isPublic && error && <p className="note pad">{error}</p>}
        {isPublic && !data && !error && <p className="note pad">Loading...</p>}
        {isPublic && data && data.demo && <p className="banner">Demo content. Connect Supabase to show real festivals.</p>}
        {isPublic && data && (m ? <Festival data={data} slug={m[1]} onOpen={openFilm} onChannel={setChannel} /> : <Hub data={data} go={go} onOpen={openFilm} onChannel={setChannel} />)}
      </main>
      {(isPublic || isAccess || isVirtual) && <Footer />}
      {channel && data && <Suspense fallback={null}><ChannelPlayer channelId={channel} data={data} onClose={() => setChannel(null)} /></Suspense>}
      {open && <FilmModal key={open.id + openMode} film={open} festival={openFest} startMode={openMode} products={data ? data.products : []} onClose={() => setOpen(null)} />}
    </div>
  )
}
