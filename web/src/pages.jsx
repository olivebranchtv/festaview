import { lazy, Suspense, useEffect, useState } from 'react'
import { submitInquiry, unlockStream, storedCode, storeCode, startCheckout, claimAccess } from './data.js'
import { buildChannels, schedule } from './channels.js'
import { eventState, fmtWhen } from './virtual.js'
import { festivalPath, filmPath, liveFeedPath, slugify, submitPath } from './paths.js'
import { submissionState } from './submissionRules.js'
import { FAQ, BENEFITS, SITE_DESCRIPTION } from './siteContent.js'
import { useSeo } from './seo.js'
import { CONTACT_EMAIL } from './config.js'
import { bg, useTick, formatPrice, accentText, fmtDates, RokuButton, FilmCard, VoteButton, AccessPanel, EventCard, ChannelRow } from './ui.jsx'

const Player = lazy(() => import('./Player.jsx'))
const ChannelPlayer = lazy(() => import('./ChannelPlayer.jsx'))

const upcomingEvents = (data, festivalId) => (data.events || [])
  .filter((e) => (!festivalId || e.festival_id === festivalId) && !eventState(e).ended)
  .sort((a, b) => {
    const rank = (e) => { const s = eventState(e); return s.live ? 0 : s.soon ? 1 : 2 }
    return rank(a) - rank(b) || new Date(a.starts_at || a.available_from || 0) - new Date(b.starts_at || b.available_from || 0)
  })

function SectionHead({ title, href, more }) {
  return (
    <div className="sec-head">
      <h2>{title}</h2>
      {href && <a className="more" href={href}>{more || 'See all'}</a>}
    </div>
  )
}

// ---------------------------------------------------------------- not found
export function NotFoundPage() {
  useSeo({ title: 'Page not found', robots: 'noindex' })
  return (
    <section className="block">
      <h1>Page not found</h1>
      <p className="lede">We could not find that page. Try one of these:</p>
      <ul className="ticks">
        <li><a href="/festivals">Browse film festivals</a></li>
        <li><a href="/films">Browse films</a></li>
        <li><a href="/virtual">Virtual cinema</a></li>
        <li><a href="/">Festaview home</a></li>
      </ul>
    </section>
  )
}

// ---------------------------------------------------------------- shared lists
function FestivalCards({ festivals, data }) {
  return (
    <div className="grid">
      {festivals.map((f) => {
        const count = data.films.filter((m) => m.festival_id === f.id).length
        return (
          <a key={f.id} className="fest" href={festivalPath(f)}>
            <div className="fest-art" style={f.banner_url ? { backgroundImage: 'url(' + f.banner_url + ')' } : bg(f.brand_color)}>
              {f.logo_url && <img src={f.logo_url} alt={f.name + ' logo'} />}
            </div>
            <div className="fest-body">
              <h3 className="fest-name">{f.name}</h3>
              <div className="fest-tag">{f.tagline}</div>
              <div className="fest-count">{count} {count === 1 ? 'film' : 'films'}</div>
            </div>
          </a>
        )
      })}
    </div>
  )
}

function EventGrid({ events, data }) {
  return <div className="event-grid">{events.map((e) => <EventCard key={e.id} ev={e} fest={data.festivals.find((f) => f.id === e.festival_id)} />)}</div>
}

function GuideList({ chans }) {
  return <div className="guide-list">{chans.map((c) => <ChannelRow key={c.id} ch={c} />)}</div>
}

// ---------------------------------------------------------------- home
function HeroVisual({ festivals }) {
  const tiles = festivals.slice(0, 6)
  while (tiles.length < 6) tiles.push(null)
  return (
    <div className="hv" aria-hidden="true">
      <div className="hv-screen">
        <div className="hv-top"><span className="hv-brand">FESTAVIEW</span><span className="pill live">Live now</span></div>
        <div className="hv-grid">
          {tiles.map((f, i) => (
            <div key={f ? f.id : 'n' + i} className="hv-tile" style={f ? bg(f.brand_color) : undefined}>{f && <span>{f.name}</span>}</div>
          ))}
        </div>
      </div>
      <div className="hv-stand" />
    </div>
  )
}

export function HomePage({ data, theater }) {
  useTick(30000)
  useSeo({ title: 'Watch Film Festivals Online', description: SITE_DESCRIPTION, canonicalPath: '/' })
  const stats = { festivals: data.festivals.length, films: data.films.length, live: data.feeds.filter((f) => f.is_live || f.is_replay_loop).length }
  const events = upcomingEvents(data)
  const chans = buildChannels(data)
  const films = data.films.slice(0, 12)
  return (
    <>
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
              <a className="btn ghost" href="/festivals">Browse festivals</a>
            </div>
            <ul className="stats">
              <li><strong>{stats.festivals}</strong><span>{stats.festivals === 1 ? 'festival' : 'festivals'}</span></li>
              <li><strong>{stats.films}</strong><span>{stats.films === 1 ? 'film' : 'films'}</span></li>
              <li><strong>{stats.live}</strong><span>live {stats.live === 1 ? 'channel' : 'channels'}</span></li>
            </ul>
          </div>
          <HeroVisual festivals={data.festivals} />
        </div>
      </section>

      {theater}

      {events.length > 0 && (
        <section className="block">
          <SectionHead title="Virtual cinema" href="/virtual" more="All virtual events" />
          <EventGrid events={events.slice(0, 3)} data={data} />
        </section>
      )}

      {chans.length > 0 && (
        <section className="block">
          <SectionHead title="TV guide" href="/tv-guide" more="Full guide" />
          <GuideList chans={chans.slice(0, 3)} />
        </section>
      )}

      <section className="block">
        <SectionHead title="Just added" href="/films" more="All films" />
        {films.length === 0 ? <p className="note">Films are on their way. Check back soon.</p> : (
          <div className="row">{films.map((m) => <FilmCard key={m.id} film={m} festival={data.festivals.find((f) => f.id === m.festival_id)} />)}</div>
        )}
      </section>

      <section className="block">
        <SectionHead title="Festivals" href="/festivals" more="All festivals" />
        {data.festivals.length === 0 ? <p className="note">No festivals yet.</p> : <FestivalCards festivals={data.festivals.slice(0, 6)} data={data} />}
      </section>

      <section className="block split">
        <div>
          <h2>Watch on the biggest screen</h2>
          <p className="lede">Open the Festaview channel on Roku and browse every festival, jump into a live premiere, or pick up a short before dinner.</p>
          <div className="actions"><RokuButton /><a className="btn ghost" href="/watch">How to watch</a></div>
        </div>
        <div className="tv" aria-hidden="true"><div className="tv-screen"><span className="tv-brand">FESTAVIEW</span><div className="tv-rows"><i /><i /><i /></div></div><div className="tv-stand" /></div>
      </section>

      <section className="block pitch">
        <h2>Run a film festival?</h2>
        <p className="lede">Your festival runs for a week. Your audience should be there all year. Create a free festival account and your festival is set up in minutes.</p>
        <div className="actions">
          <a className="btn" href="/admin?signup=1">Create your festival</a>
          <a className="btn ghost" href="/for-festivals">See how it works</a>
        </div>
      </section>
    </>
  )
}

// ---------------------------------------------------------------- list pages
export function FestivalsPage({ data }) {
  useSeo({ title: 'Film Festivals to Watch Online', description: 'Browse film festivals streaming on Festaview. Watch official selections, virtual screenings and festival TV channels from festivals around the world.' })
  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Film festivals</span></nav>
      <h1>Film festivals</h1>
      <p className="lede">Every festival on Festaview has its own page, film guide, schedule and channel. Pick one to start watching.</p>
      {data.festivals.length === 0 ? <p className="note">No festivals yet.</p> : <FestivalCards festivals={data.festivals} data={data} />}
    </section>
  )
}

export function FilmsPage({ data }) {
  const [genre, setGenre] = useState('')
  useSeo({ title: 'Watch Independent Films Online', description: 'Stream independent films from film festivals around the world. Shorts, features and documentaries, most of them free to watch on Festaview.' })
  const genres = [...new Set(data.films.map((m) => m.genre).filter(Boolean))]
  const shown = data.films.filter((m) => !genre || m.genre === genre)
  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Films</span></nav>
      <h1>Watch independent films</h1>
      <p className="lede">Official selections from film festivals, from shorts to features. Most are free to watch.</p>
      {genres.length > 1 && (
        <div className="chips">
          <button className={'chip' + (!genre ? ' on' : '')} onClick={() => setGenre('')}>All</button>
          {genres.map((g) => <button key={g} className={'chip' + (genre === g ? ' on' : '')} onClick={() => setGenre(g)}>{g}</button>)}
        </div>
      )}
      {shown.length === 0 ? <p className="note">No films yet. Check back soon.</p> : (
        <div className="fp-grid">{shown.map((m) => <FilmCard key={m.id} film={m} festival={data.festivals.find((f) => f.id === m.festival_id)} />)}</div>
      )}
    </section>
  )
}

export function VirtualListPage({ data }) {
  useTick(30000)
  useSeo({ title: 'Virtual Cinema: Online Screenings and Live Events', description: 'Watch film festival screenings, programs and live events online. Virtual cinema on Festaview with watch windows, live Q&As and chat.' })
  const events = upcomingEvents(data)
  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Virtual cinema</span></nav>
      <h1>Virtual cinema</h1>
      <p className="lede">Film festival screenings, programs and live events you can watch from home.</p>
      {events.length > 0 ? <EventGrid events={events} data={data} /> : (
        <div className="access">
          <h2 className="h3">No virtual events are scheduled right now</h2>
          <p className="note">Festivals add online screenings, programs and live events here. Browse the festivals to see what is coming up.</p>
          <p><a className="btn" href="/festivals">Browse festivals</a></p>
        </div>
      )}
      <h2>How virtual cinema works</h2>
      <ul className="ticks">
        <li><strong>Screenings and programs.</strong> Watch one film, or a program of several films played in order.</li>
        <li><strong>Live events.</strong> Join a live stream with chat and a question box for the filmmakers.</li>
        <li><strong>Watch windows.</strong> Each screening opens at a set time, and once you press play you have a set number of hours to finish.</li>
        <li><strong>Free or ticketed.</strong> Many screenings are free. Ticketed events use an access code from the festival.</li>
      </ul>
    </section>
  )
}

export function TvGuidePage({ data }) {
  useTick(30000)
  useSeo({ title: 'TV Guide: Film Festival Channels', description: 'See what is playing now on every film festival channel. Festaview channels play festival films on a schedule, so everyone watches together.' })
  const chans = buildChannels(data)
  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>TV guide</span></nav>
      <h1>TV guide</h1>
      <p className="lede">Festival channels play on a schedule. Tune in and you join whatever is on right now.</p>
      {chans.length > 0 ? <GuideList chans={chans} /> : (
        <div className="access">
          <h2 className="h3">No channels are on right now</h2>
          <p className="note">Festivals can switch on an automatic channel that plays their films back to back. Check back soon.</p>
          <p><a className="btn" href="/festivals">Browse festivals</a></p>
        </div>
      )}
    </section>
  )
}

export function ChannelPage({ data, slug }) {
  const ch = buildChannels(data).find((c) => c.slug === slug)
  useSeo(ch ? { title: ch.name + ': Now Playing', description: 'Watch ' + ch.name + ' on Festaview. A scheduled channel of festival films, so everyone sees the same film at the same time.' } : { title: 'Channel not found', robots: 'noindex' })
  if (!ch) return <NotFoundPage />
  return (
    <section className="block room">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/tv-guide">TV guide</a> / <span>{ch.name}</span></nav>
      <h1>{ch.name}</h1>
      <Suspense fallback={<p className="note">Loading the channel...</p>}><ChannelPlayer channelId={ch.id} data={data} /></Suspense>
    </section>
  )
}

export function LivePage({ data }) {
  useSeo({ title: 'Live and Always-On Festival Channels', description: 'Live premieres, Q&As and 24/7 replay channels from film festivals, streaming on Festaview.' })
  const feeds = data.feeds.filter((f) => f.is_live || f.is_replay_loop)
  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Live channels</span></nav>
      <h1>Live and always-on channels</h1>
      <p className="lede">Live premieres, Q&As and replay channels from film festivals.</p>
      {feeds.length === 0 ? <p className="note">Live premieres and 24/7 festival channels will appear here.</p> : (
        <div className="row wrap">
          {feeds.map((f) => {
            const fest = data.festivals.find((x) => x.id === f.festival_id)
            return (
              <a key={f.id} className="live-card" href={liveFeedPath(f)} style={f.poster_url ? { backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,.75), rgba(0,0,0,.1)), url(' + f.poster_url + ')', backgroundSize: 'cover' } : bg(fest && fest.brand_color)}>
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

export function LiveFeedPage({ data, id }) {
  const feed = data.feeds.find((f) => f.id === id)
  const fest = feed && data.festivals.find((f) => f.id === feed.festival_id)
  useSeo(feed ? { title: feed.name, description: (feed.is_live ? 'Watch ' : 'Watch the replay channel ') + feed.name + (fest ? ' from ' + fest.name : '') + ' on Festaview.' } : { title: 'Channel not found', robots: 'noindex' })
  if (!feed) return <NotFoundPage />
  const pseudo = { id: 'live-' + feed.id, festival_id: feed.festival_id, title: feed.name, video_url: feed.stream_url, poster_url: feed.poster_url, live: true }
  return (
    <section className="block room">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/live">Live channels</a> / <span>{feed.name}</span></nav>
      <h1>{feed.name}</h1>
      {feed.stream_url ? <Suspense fallback={<div className="modal-art" />}><Player film={pseudo} track={false} /></Suspense> : <p className="note">This stream starts soon.</p>}
      {fest && <p className="note">From <a href={festivalPath(fest)}>{fest.name}</a></p>}
    </section>
  )
}

// ---------------------------------------------------------------- info pages
export function WatchPage() {
  useSeo({ title: 'How to Watch: Roku and Web', description: 'Watch Festaview on the web or on Roku. Free, ad-supported film festival streaming with live premieres, virtual screenings and festival channels.' })
  return (
    <section className="block split">
      <div>
        <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>Watch</span></nav>
        <h1>Watch on the biggest screen</h1>
        <p className="lede">Festaview is built for the living room. Open the Roku channel and browse every festival, jump into a live premiere, or pick up a short before dinner. You can also watch on any web browser.</p>
        <ul className="ticks">
          <li>Free and ad-supported, no subscription (some festivals add ticketed events)</li>
          <li>Live premieres, Q&amp;As and 24/7 replay channels</li>
          <li>Captions on films, so everyone can watch</li>
          <li>Festival-branded rows, so you always know whose selection you are watching</li>
        </ul>
        <div className="actions"><RokuButton /><a className="btn ghost" href="/festivals">Watch on the web</a></div>
      </div>
      <div className="tv" aria-hidden="true"><div className="tv-screen"><span className="tv-brand">FESTAVIEW</span><div className="tv-rows"><i /><i /><i /></div></div><div className="tv-stand" /></div>
    </section>
  )
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
  if (state === 'done') return <div className="inquiry"><h3>Thank you</h3><p className="note">We received your details and will be in touch soon.</p></div>
  return (
    <form className="inquiry" onSubmit={submit}>
      <h3>Talk to us about your festival</h3>
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

export function ForFestivalsPage() {
  useSeo({ title: 'For Film Festivals: Stream Your Festival Year-Round', description: 'Give your film festival its own channel, page, virtual screenings and live events on Festaview. Festivals receive 80% of the ad revenue their content earns.' })
  return (
    <section className="block pitch">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>For film festivals</span></nav>
      <h1>Run a film festival?</h1>
      <p className="lede">Your festival runs for a week. Your audience should be there all year. Create a free festival account and your festival is set up in minutes.</p>
      <div className="benefits">
        {BENEFITS.map(([t, d]) => <div key={t} className="benefit"><h2 className="h3">{t}</h2><p>{d}</p></div>)}
      </div>
      <div className="actions">
        <a className="btn" href="/admin?signup=1">Create your festival</a>
        <a className="btn ghost" href="/admin">Festival login</a>
      </div>
      <InquiryForm />
      <div className="faq">
        <h2>Questions</h2>
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div>
    </section>
  )
}

export function AboutPage() {
  useSeo({ title: 'About Festaview', description: SITE_DESCRIPTION })
  return (
    <section className="block">
      <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <span>About</span></nav>
      <h1>About Festaview</h1>
      <p className="lede">{SITE_DESCRIPTION}</p>
      <h2>What you can do here</h2>
      <ul className="ticks">
        <li>Watch official selections from film festivals, on demand.</li>
        <li>Join live premieres, virtual screenings and Q&amp;As.</li>
        <li>Tune in to festival channels that play on a schedule.</li>
        <li>Watch on Roku or any web browser.</li>
      </ul>
      <h2>For festivals and filmmakers</h2>
      <p>Festivals get their own page, channel and virtual cinema, and receive 80% of the ad revenue their content earns. <a href="/for-festivals">Learn how it works</a>.</p>
      <h2>Contact</h2>
      <p>Email <a href={'mailto:' + CONTACT_EMAIL}>{CONTACT_EMAIL}</a>.</p>
    </section>
  )
}

// After a card payment: fetches the access code the payment created and remembers it on this device.
export function AccessClaim({ search }) {
  useSeo({ title: 'Your access', robots: 'noindex' })
  const sid = new URLSearchParams(search || '').get('session_id')
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
      <h1>Your access</h1>
      {!sid && <p className="note">This page needs a payment reference. <a href="/">Back to Festaview</a></p>}
      {sid && r.status === 'pending' && <p className="note">Confirming your payment...</p>}
      {r.status === 'ready' && (
        <>
          <p className="ok">Payment received. Your access code:</p>
          <p className="code">{r.code}</p>
          <p className="note">Keep this code. It is already saved on this device, and you can enter it on any device to watch.</p>
          <div className="actions">
            {r.eventId && <a className="btn" href={'/virtual/' + r.eventId}>Go to your screening</a>}
            {r.festivalSlug && <a className={'btn' + (r.eventId ? ' ghost' : '')} href={'/festival/' + r.festivalSlug}>Go to the festival</a>}
          </div>
        </>
      )}
      {(r.status === 'timeout' || r.status === 'error') && <p className="error">We could not confirm your payment yet. If you were charged, contact the festival with your receipt.</p>}
    </section>
  )
}

// ---------------------------------------------------------------- film page
export function FilmPage({ data, id }) {
  const film = data.films.find((m) => m.id === id)
  const festival = film && data.festivals.find((f) => f.id === film.festival_id)
  const [mode, setMode] = useState(() => (new URLSearchParams(window.location.search).get('trailer') ? 'trailer' : 'film'))
  const [stream, setStream] = useState(film ? film.video_url || '' : '')
  useSeo(film ? {
    title: film.title + (film.year ? ' (' + film.year + ')' : '') + (festival ? ' | ' + festival.name : ''),
    description: (film.synopsis || 'Watch ' + film.title + ' online') + (festival ? ' An official selection of ' + festival.name + '.' : ''),
    canonicalPath: filmPath(film), image: film.poster_url || undefined, type: 'video.movie',
  } : { title: 'Film not found', robots: 'noindex' })
  useEffect(() => { setStream(film ? film.video_url || '' : ''); setMode(new URLSearchParams(window.location.search).get('trailer') ? 'trailer' : 'film') }, [film && film.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // A code entered earlier on this device unlocks a ticketed film automatically.
  useEffect(() => {
    if (!film || film.access !== 'ticketed' || film.video_url) return
    const c = storedCode(film.festival_id)
    if (c) unlockStream(film.id, c).then((u) => { if (u) setStream(u) })
  }, [film && film.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!film) return <NotFoundPage />
  const locked = film.access === 'ticketed' && !stream
  const more = data.films.filter((m) => m.festival_id === film.festival_id && m.id !== film.id).slice(0, 6)
  const meta = [film.category, film.year, film.runtime_min ? film.runtime_min + ' min' : null, film.genre, film.rating, film.country, film.language].filter(Boolean).join('  |  ')
  return (
    <article className="block film-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a> / <a href="/films">Films</a>{festival && <> / <a href={festivalPath(festival)}>{festival.name}</a></>} / <span>{film.title}</span>
      </nav>
      <div className="film-grid">
        <div className="film-media">
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
                  : <Player key="film" film={{ ...film, video_url: stream }} track />}
              </Suspense>
            </>
          ) : (
            <div className="modal-art" style={film.poster_url ? undefined : bg(festival && festival.brand_color)}>
              {film.poster_url && <img src={film.poster_url} alt={'Poster for ' + film.title} />}
            </div>
          )}
        </div>
        <div className="film-info">
          <h1>{film.title}</h1>
          {meta && <p className="meta">{meta}</p>}
          {film.director && <p className="meta">Directed by {film.director}</p>}
          {festival && <p className="meta">Official Selection, <a href={festivalPath(festival)}>{festival.name}</a></p>}
          <p>{film.synopsis || 'Synopsis coming soon.'}</p>
          {locked && <AccessPanel film={film} festival={festival} products={data.products} onUnlocked={(u) => { setStream(u); setMode('film') }} />}
          <div className="actions">
            {!locked && film.access !== 'ticketed' && <RokuButton />}
            {festival && festival.voting_open && <VoteButton film={film} />}
          </div>
          {film.access !== 'ticketed' && <p className="note small">Also available on the Festaview Roku channel.</p>}
        </div>
      </div>
      {more.length > 0 && (
        <section>
          <h2>More from {festival ? festival.name : 'this festival'}</h2>
          <div className="row">{more.map((m) => <FilmCard key={m.id} film={m} festival={festival} />)}</div>
        </section>
      )}
    </article>
  )
}

// ---------------------------------------------------------------- festival page
const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

function downloadIcs(festival, items, venues) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Festaview//Screenings//EN', 'CALSCALE:GREGORIAN']
  for (const s of items) {
    const v = venues.find((x) => x.id === s.venue_id)
    lines.push('BEGIN:VEVENT', 'UID:' + s.id + '@festaview', 'DTSTAMP:' + icsStamp(new Date().toISOString()), 'DTSTART:' + icsStamp(s.starts_at), 'DTEND:' + icsStamp(s.ends_at),
      'SUMMARY:' + icsText((s.title || 'Screening') + ' - ' + festival.name), 'LOCATION:' + icsText(v ? [v.name, v.address, v.city].filter(Boolean).join(', ') : ''),
      s.ticket_url ? 'URL:' + s.ticket_url : 'DESCRIPTION:' + icsText(festival.name), 'END:VEVENT')
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
    <section className="block" id="theaters">
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

function PassesSection({ fest, products, ticketed }) {
  const [msg, setMsg] = useState('')
  const [code, setCode] = useState('')
  const [ok, setOk] = useState(false)
  const buy = async (p) => { setMsg(''); const r = await startCheckout(p.id); if (r.ok) window.location.href = r.url; else setMsg(r.message) }
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

export function FestivalPage({ data, slug }) {
  useTick(30000)
  const [genre, setGenre] = useState('')
  const [q, setQ] = useState('')
  const fest = data.festivals.find((f) => f.slug === slug)
  const films = fest ? data.films.filter((m) => m.festival_id === fest.id) : []
  const dates = fest ? fmtDates(fest.starts_on, fest.ends_on) : ''
  useSeo(fest ? {
    title: fest.name + ': Watch the Festival Online',
    description: (fest.tagline ? fest.tagline + '. ' : '') + 'Watch ' + fest.name + ' online: ' + (films.length ? films.length + (films.length === 1 ? ' film' : ' films') + ', ' : '') + 'virtual screenings and live events on Festaview.' + (dates ? ' ' + dates + '.' : ''),
    canonicalPath: festivalPath(fest), image: fest.banner_url || (films[0] && films[0].poster_url) || undefined,
  } : { title: 'Festival not found', robots: 'noindex' })
  if (!fest) return <NotFoundPage />

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
  const to = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const fProducts = (data.products || []).filter((p) => p.festival_id === fest.id)
  const ticketedFilms = films.filter((m) => m.access === 'ticketed')
  const showPasses = fProducts.length > 0 || ticketedFilms.length > 0 || !!fest.passes_url
  const events = upcomingEvents(data, fest.id)
  const chan = buildChannels(data).find((c) => c.festivalId === fest.id)
  const nav = [['about', 'About'], events.length ? ['virtual', 'Virtual'] : null, showPasses ? ['passes', 'Passes'] : null, chan ? ['channel', 'Channel'] : null, films.length ? ['selection', 'Films'] : null, feeds.length ? ['live', 'Live'] : null, sched.length ? ['schedule', 'Schedule'] : null, theaterShows.length ? ['theaters', 'In theaters'] : null].filter(Boolean)
  const meta = (m) => [m.category, m.year, m.runtime_min ? m.runtime_min + ' min' : null, m.genre, m.rating].filter(Boolean).join('  |  ')

  return (
    <div className="fp" style={{ '--accent': accent, '--gold': accent, '--accent-text': accentText(accent) }}>
      <section className="fp-hero">
        <div className="fp-backdrop" style={backdrop ? { backgroundImage: 'url(' + backdrop + ')' } : bg(accent)} />
        <div className="fp-shade" />
        <div className="fp-hero-inner">
          <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/festivals">Film festivals</a> / <span>{fest.name}</span></nav>
          {fest.logo_url && <img className="fest-logo" src={fest.logo_url} alt={fest.name + ' logo'} />}
          {(dates || fest.location) && <p className="eyebrow">{[dates, fest.location].filter(Boolean).join('   |   ')}</p>}
          <h1>{fest.name}</h1>
          {fest.tagline && <p className="lede">{fest.tagline}</p>}
          <div className="actions">
            {featured && featured.video_url && <a className="btn" href={filmPath(featured)}>Watch now</a>}
            {featured && !featured.video_url && <button className="btn" onClick={() => to('selection')}>See the films</button>}
            {submissionState(fest) === 'open' && <a className="btn ghost" href={submitPath(fest)}>Submit your film</a>}
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
            {featured.poster_url ? <img src={featured.poster_url} alt={'Poster for ' + featured.title} /> : <div className="spot-fallback" style={bg(accent)}>{featured.title}</div>}
          </div>
          <div className="spot-copy">
            <p className="eyebrow">Spotlight</p>
            <h2>{featured.title}</h2>
            {meta(featured) && <p className="meta">{meta(featured)}</p>}
            {featured.director && <p className="meta">Directed by {featured.director}</p>}
            <p className="lede small">{featured.synopsis || 'An Official Selection of ' + fest.name + '.'}</p>
            <div className="actions">
              {featured.video_url && <a className="btn" href={filmPath(featured)}>Watch film</a>}
              {featured.trailer_url && <a className="btn ghost" href={filmPath(featured) + '?trailer=1'}>Watch trailer</a>}
              {!featured.video_url && <a className="btn" href={filmPath(featured)}>Details</a>}
            </div>
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section id="virtual" className="block">
          <SectionHead title="Virtual cinema" href="/virtual" more="All virtual events" />
          <EventGrid events={events} data={data} />
        </section>
      )}

      {showPasses && <PassesSection fest={fest} products={fProducts} ticketed={ticketedFilms} />}

      {chan && (
        <section id="channel" className="block">
          <h2>{fest.name} Channel</h2>
          <div className="guide-list"><ChannelRow ch={chan} /></div>
          {(() => {
            const next = schedule(chan, 4).slice(1)
            if (!next.length || chan.items.length < 2) return null
            return (
              <ul className="schedule">
                {next.map((p, i) => <li key={i}><span className="when">{new Date(p.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span><strong>{p.item.title}</strong></li>)}
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
          {shown.length === 0 ? <p className="note">No films match.</p> : <div className="fp-grid">{shown.map((m) => <FilmCard key={m.id} film={m} festival={fest} />)}</div>}
        </section>
      )}
      {films.length === 0 && <section className="block"><h2>Official Selection</h2><p className="note">This festival's films are coming soon.</p></section>}

      {feeds.length > 0 && (
        <section id="live" className="block">
          <h2>Live channel</h2>
          <div className="row">
            {feeds.map((l) => (
              <a key={l.id} className={'live-card' + (l.stream_url ? ' playable' : '')} href={l.stream_url ? liveFeedPath(l) : undefined} style={l.poster_url ? { backgroundImage: 'linear-gradient(0deg, rgba(0,0,0,.75), rgba(0,0,0,.1)), url(' + l.poster_url + ')', backgroundSize: 'cover' } : bg(accent)}>
                <span className={'pill ' + (l.is_live ? 'live' : '')}>{l.is_live ? 'Live now' : 'Replay channel'}</span>
                <strong>{l.name}</strong>
                <small>{l.stream_url ? 'Watch now' : 'Stream starts soon'}</small>
              </a>
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
              return <li key={s.id}><span className="when">{fmtWhen(s.starts_at)}</span><strong>{s.title || (film && film.title) || 'To be announced'}</strong>{feed && <small>{feed.name}</small>}</li>
            })}
          </ul>
        </section>
      )}

      <TheaterScreenings fest={fest} data={data} />

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
