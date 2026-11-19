import { lazy, Suspense, useEffect, useState } from 'react'
import { loadData } from './data.js'
import { buildChannels } from './channels.js'
import { eventState } from './virtual.js'
import { matchRoute, STATIC_PAGES } from './paths.js'
import { usePath, installLinkHandler } from './router.js'
import { useSeo } from './seo.js'
import { CinemaPage, ShowingPage, NowShowingStrip } from './cinema.jsx'
import { CONTACT_EMAIL } from './config.js'
import {
  HomePage, FestivalsPage, FilmsPage, VirtualListPage, TvGuidePage, ChannelPage, LivePage, LiveFeedPage,
  WatchPage, ForFestivalsPage, AboutPage, AccessClaim, FilmPage, FestivalPage, NotFoundPage,
} from './pages.jsx'

// Loaded on demand so public pages stay light (admin, owner console, theater mode and the virtual room are separate chunks).
const Admin = lazy(() => import('./Admin.jsx'))
const Network = lazy(() => import('./Network.jsx'))
const Theater = lazy(() => import('./Theater.jsx'))
const VirtualRoom = lazy(() => import('./VirtualRoom.jsx'))

function Header({ path }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false) }, [path])
  const links = [['/festivals', 'Festivals'], ['/films', 'Films'], ['/cinema', 'Virtual theater'], ['/virtual', 'Virtual cinema'], ['/tv-guide', 'TV guide'], ['/live', 'Live'], ['/watch', 'Watch'], ['/for-festivals', 'For festivals']]
  return (
    <header className="top">
      <a href="/" className="brand"><span className="mark" aria-hidden="true" />FESTAVIEW</a>
      <button className="menu-btn" type="button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}</button>
      <nav id="site-nav" className={'nav' + (open ? ' open' : '')} aria-label="Main">
        {links.map(([href, label]) => <a key={href} href={href} aria-current={path === href || path.startsWith(href + '/') ? 'page' : undefined}>{label}</a>)}
      </nav>
      <a className="admin-link" href="/admin">Festival login</a>
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div>
        <span className="brand"><span className="mark" aria-hidden="true" />FESTAVIEW</span>
        <p className="note">Every festival. Every screen.</p>
      </div>
      <nav className="footer-links" aria-label="Footer">
        {STATIC_PAGES.filter(([href]) => href !== '/').map(([href, label]) => <a key={href} href={href}>{label}</a>)}
        <a href={'mailto:' + CONTACT_EMAIL}>Contact</a>
        <a href="/admin">Festival login</a>
      </nav>
      <p className="note small">&copy; {new Date().getFullYear()} Festaview</p>
    </footer>
  )
}

function PrivateTitle({ title }) { useSeo({ title, robots: 'noindex,nofollow' }); return null }

export default function App() {
  const { path, search } = usePath()
  const route = matchRoute(path)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { installLinkHandler() }, [])
  useEffect(() => {
    loadData().then(setData).catch(() => setError('Festaview is having trouble loading right now. Please refresh in a moment.'))
  }, [])

  const isTheater = route && route.name === 'theater'
  const needsData = route && !route.private && route.name !== 'about' && route.name !== 'forFestivals' && route.name !== 'watch'

  let page = null
  if (!route) page = <NotFoundPage />
  else if (route.name === 'admin') page = <Suspense fallback={<p className="note pad">Loading...</p>}><PrivateTitle title="Festival admin" /><div className="wrap-admin"><Admin /></div></Suspense>
  else if (route.name === 'network') page = <Suspense fallback={<p className="note pad">Loading...</p>}><PrivateTitle title="Network console" /><div className="wrap-admin"><Network /></div></Suspense>
  else if (route.name === 'theater') page = <Suspense fallback={<p className="note pad">Loading...</p>}><PrivateTitle title="Theater mode" /><Theater slug={route.slug} /></Suspense>
  else if (route.name === 'access') page = <AccessClaim search={search} />
  else if (route.name === 'about') page = <AboutPage />
  else if (route.name === 'forFestivals') page = <ForFestivalsPage />
  else if (route.name === 'watch') page = <WatchPage />
  else if (route.name === 'cinema') page = <CinemaPage />
  else if (route.name === 'showing') page = <ShowingPage id={route.id} />
  else if (error) page = <p className="note pad">{error}</p>
  else if (!data) page = <p className="note pad">Loading...</p>
  else {
    switch (route.name) {
      case 'home': page = <HomePage data={data} theater={<NowShowingStrip />} />; break
      case 'festivals': page = <FestivalsPage data={data} />; break
      case 'festival': page = <FestivalPage data={data} slug={route.slug} />; break
      case 'films': page = <FilmsPage data={data} />; break
      case 'film': page = <FilmPage data={data} id={route.id} />; break
      case 'virtualList': page = <VirtualListPage data={data} />; break
      case 'event': page = <Suspense fallback={<p className="note pad">Loading...</p>}><VirtualRoom key={route.id} eventId={route.id} data={data} /></Suspense>; break
      case 'tvGuide': page = <TvGuidePage data={data} />; break
      case 'channel': page = <ChannelPage data={data} slug={route.slug} />; break
      case 'liveList': page = <LivePage data={data} />; break
      case 'liveFeed': page = <LiveFeedPage data={data} id={route.id} />; break
      default: page = <NotFoundPage />
    }
  }

  return (
    <div className="app">
      {!isTheater && <a className="skip" href="#main">Skip to content</a>}
      {!isTheater && <Header path={path} />}
      <main id="main">
        {needsData && data && data.demo && <p className="banner">Demo content. Connect Supabase to show real festivals.</p>}
        {page}
      </main>
      {!isTheater && !(route && (route.name === 'admin' || route.name === 'network')) && <Footer />}
    </div>
  )
}
