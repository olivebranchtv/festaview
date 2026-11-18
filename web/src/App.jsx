import { lazy, Suspense, useEffect, useState } from 'react'
import { loadData, castVote, submitInquiry } from './data.js'

// Loaded on demand so the public home page stays light (video player, admin and owner console are separate chunks).
const Admin = lazy(() => import('./Admin.jsx'))
const Network = lazy(() => import('./Network.jsx'))
const Player = lazy(() => import('./Player.jsx'))
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

function FilmModal({ film, festival, onClose }) {
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={film.title}>
        {film.video_url ? (
          <Suspense fallback={<div className="modal-art" />}><Player film={film} /></Suspense>
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
          <div className="actions">
            <RokuButton />
            {festival && festival.voting_open && <VoteButton film={film} />}
          </div>
          <p className="note small">Also available on the Festaview Roku channel.</p>
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
          winners from festivals around the globe, free, any time.
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
          <li>Free and ad-supported, no subscription</li>
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
    ['Does it cost anything to watch?', 'No. Festaview is free and supported by ads.'],
    ['Where can I watch?', 'On Roku today, and on the web. More TV platforms are planned.'],
    ['How do festivals earn money?', 'Festivals receive 80% of the ad revenue their content earns. Festivals can also add their own sponsors.'],
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

function Hub({ data, go, onOpen }) {
  const stats = {
    festivals: data.festivals.length,
    films: data.films.length,
    live: data.feeds.filter((f) => f.is_live || f.is_replay_loop).length,
  }
  return (
    <>
      <Hero go={go} stats={stats} festivals={data.festivals} />
      <LiveSection data={data} />
      <Featured data={data} onOpen={onOpen} />
      <FestivalGrid data={data} />
      <Devices />
      <ForFestivals />
      <Faq />
    </>
  )
}

function Festival({ data, slug, onOpen }) {
  const fest = data.festivals.find((f) => f.slug === slug)
  if (!fest) return <section className="block"><p className="note">Festival not found. <a href="#/">Back to all festivals</a></p></section>
  const films = data.films.filter((m) => m.festival_id === fest.id)
  const feeds = data.feeds.filter((l) => l.festival_id === fest.id)
  return (
    <>
      <section className="fest-hero" style={fest.banner_url ? { backgroundImage: 'linear-gradient(0deg, #0b0b12 5%, rgba(11,11,18,.4)), url(' + fest.banner_url + ')' } : bg(fest.brand_color)}>
        <div className="hero-inner">
          <a className="back" href="#/">All festivals</a>
          {fest.logo_url && <img className="fest-logo" src={fest.logo_url} alt="" />}
          <h1>{fest.name}</h1>
          {fest.tagline && <p className="lede">{fest.tagline}</p>}
          <div className="actions">
            <RokuButton />
            {fest.website && <a className="btn ghost" href={fest.website} target="_blank" rel="noreferrer">Festival website</a>}
          </div>
        </div>
      </section>
      {fest.description && (
        <section className="block"><h2>About</h2><p className="lede">{fest.description}</p></section>
      )}
      {feeds.length > 0 && (
        <section className="block">
          <h2>Live channel</h2>
          <div className="row">
            {feeds.map((l) => (
              <div key={l.id} className="live-card" style={bg(fest.brand_color)}>
                <span className={'pill ' + (l.is_live ? 'live' : '')}>{l.is_live ? 'Live now' : 'Replay channel'}</span>
                <strong>{l.name}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
      {(() => {
        const ids = feeds.map((l) => l.id)
        const items = (data.schedule || []).filter((s) => ids.includes(s.live_feed_id))
        if (!items.length) return null
        return (
          <section className="block">
            <h2>Coming up</h2>
            <ul className="schedule">
              {items.map((s) => {
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
        )
      })()}
      <section className="block">
        <h2>Official Selection</h2>
        {films.length === 0 ? (
          <p className="note">This festival's films are coming soon.</p>
        ) : (
          <div className="row wrap">
            {films.map((m) => <FilmCard key={m.id} film={m} festival={fest} onOpen={onOpen} />)}
          </div>
        )}
      </section>
    </>
  )
}

export default function App() {
  const hash = useHashRoute()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)

  // Close any open film popup when the page changes.
  useEffect(() => { setOpen(null) }, [hash])

  useEffect(() => {
    loadData().then(setData).catch((e) => setError(e.message || 'Failed to load'))
  }, [])

  const m = hash.match(/^#\/festival\/(.+)$/)
  const isAdmin = hash.startsWith('#/admin')
  const isNetwork = hash.startsWith('#/network')

  const go = (id) => {
    const scroll = () => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }) }
    if (m || isAdmin) { window.location.hash = '#/'; setTimeout(scroll, 80) } else scroll()
  }

  const openFilm = (film) => setOpen(film)
  const openFest = open && data ? data.festivals.find((f) => f.id === open.festival_id) : null

  return (
    <div className="app">
      <Header go={go} />
      <main>
        <Suspense fallback={<p className="note pad">Loading...</p>}>
          {isAdmin && <div className="wrap-admin"><Admin /></div>}
          {isNetwork && <div className="wrap-admin"><Network /></div>}
        </Suspense>
        {!isAdmin && !isNetwork && error && <p className="note pad">{error}</p>}
        {!isAdmin && !isNetwork && !data && !error && <p className="note pad">Loading...</p>}
        {!isAdmin && !isNetwork && data && data.demo && <p className="banner">Demo content. Connect Supabase to show real festivals.</p>}
        {!isAdmin && !isNetwork && data && (m ? <Festival data={data} slug={m[1]} onOpen={openFilm} /> : <Hub data={data} go={go} onOpen={openFilm} />)}
      </main>
      {!isAdmin && !isNetwork && <Footer />}
      {open && <FilmModal film={open} festival={openFest} onClose={() => setOpen(null)} />}
    </div>
  )
}
