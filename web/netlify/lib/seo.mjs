// Server-side SEO for every Festaview page: title, description, canonical, Open Graph / Twitter tags, JSON-LD structured
// data, and real crawlable HTML content. Used by the edge function (so Google, Bing and AI crawlers receive complete HTML
// without running JavaScript), the sitemap and llms.txt. Pure functions: no network access except loadCatalog().
import { SITE_NAME, SITE_URL, slugify, festivalPath, filmPath, eventPath, channelPath, liveFeedPath, cinemaPath, submitPath, matchRoute, STATIC_PAGES } from '../../src/paths.js'
import { FAQ, BENEFITS, SITE_DESCRIPTION, SITE_TAGLINE } from '../../src/siteContent.js'
import { buildChannels } from '../../src/channels.js'
import { eventState } from '../../src/virtual.js'
import { festivalCategories, submissionState, money as feeMoney, fmtDate } from '../../src/submissionRules.js'

export const DEFAULT_IMAGE = SITE_URL + '/og-default.png'
const LOGO = SITE_URL + '/logo-512.png'

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' }
const abs = (p) => SITE_URL + p
const isoDuration = (min) => (Number(min) > 0 ? 'PT' + (Math.floor(min / 60) ? Math.floor(min / 60) + 'H' : '') + (min % 60 ? (min % 60) + 'M' : '') : undefined)
const fullTitle = (t) => (t.includes(SITE_NAME) || t.length + SITE_NAME.length + 3 > 60 ? t : t + ' | ' + SITE_NAME)

// ---------------------------------------------------------------- data
const PUBLIC_URL = 'https://ckxwyhyjokpamgygdsoq.supabase.co'
const PUBLIC_KEY = 'sb_publishable_LyDs-buM_wSgTzJoM0ue7Q_ZTrrlizY' // public by design (row level security protects the data)

// Reads everything public the pages need. ok is false if the database could not be reached, so a temporary outage is never
// reported to search engines as a missing page.
export async function loadCatalog(fetchFn = fetch, { url = PUBLIC_URL, key = PUBLIC_KEY } = {}) {
  const headers = { apikey: key }
  let failed = false
  const q = async (path) => {
    try {
      const r = await fetchFn(url + '/rest/v1/' + path, { headers, signal: AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined })
      if (!r.ok) return null
      return await r.json()
    } catch { return null }
  }
  const [festivals, films, events, feeds, venues, products, screenings, cinema, subCats, subTiers] = await Promise.all([
    q('festivals?select=*&status=eq.published&order=sort_order,name'),
    q('films_public?select=*&order=created_at.desc'),
    q('virtual_events?select=*&status=eq.published'),
    q('live_feeds?select=*'),
    q('venues?select=*'),
    q('products?select=*&active=eq.true'),
    q('screenings?select=*'),
    q('cinema_board?select=*&order=starts_at'),
    // Submissions are optional: if their tables are missing, every other page still works.
    q('submission_categories?select=*&active=eq.true'),
    q('submission_tiers?select=*'),
  ])
  if (festivals === null) failed = true
  let filmList = films
  if (filmList === null) filmList = await q('films?select=*&status=eq.published&order=created_at.desc')
  return {
    ok: !failed,
    festivals: festivals || [], films: filmList || [], events: events || [], feeds: feeds || [], venues: venues || [], products: products || [], screenings: screenings || [], cinema: cinema || [], submissionCategories: subCats || [], submissionTiers: subTiers || [],
  }
}

// ---------------------------------------------------------------- HTML helpers
const link = (href, text) => '<a href="' + esc(href) + '">' + esc(text) + '</a>'
const list = (items) => (items.length ? '<ul>' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>' : '')

function shell(main) {
  const nav = STATIC_PAGES.map(([href, label]) => link(href, label)).join(' ')
  return '<div class="prerender"><header><p><strong>' + esc(SITE_NAME.toUpperCase()) + '</strong> ' + esc(SITE_TAGLINE) + '</p><nav aria-label="Main">' + nav + '</nav></header>' +
    '<main id="main">' + main + '</main>' +
    '<footer><nav aria-label="Footer">' + nav + ' ' + link('/admin', 'Festival login') + '</nav><p>&copy; ' + new Date().getFullYear() + ' ' + esc(SITE_NAME) + '</p></footer></div>'
}

const crumbs = (items) => '<nav aria-label="Breadcrumb">' + items.map(([h, t]) => (h ? link(h, t) : '<span>' + esc(t) + '</span>')).join(' / ') + '</nav>'
const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([h, t], i) => ({ '@type': 'ListItem', position: i + 1, name: t, ...(h ? { item: abs(h) } : {}) })) })

const festivalLink = (f) => link(festivalPath(f), f.name)
const filmLine = (m, fest) => link(filmPath(m), m.title) + (m.director ? ' (directed by ' + esc(m.director) + ')' : '') + (m.runtime_min ? ', ' + m.runtime_min + ' min' : '') + (fest ? ' - ' + esc(fest.name) : '')
const eventLine = (e, fest) => link(eventPath(e), e.title) + ' - ' + esc(eventState(e).label) + (fest ? ' - ' + esc(fest.name) : '')

function baseSeo(pathname) {
  const p = String(pathname || '/').split('?')[0].replace(/\/+$/, '') || '/'
  return { status: 200, title: SITE_NAME, description: SITE_DESCRIPTION, canonical: abs(p), image: DEFAULT_IMAGE, ogType: 'website', robots: 'index,follow', jsonld: [], body: '' }
}

function notFound(seo) {
  seo.status = 404
  seo.robots = 'noindex'
  seo.title = 'Page not found'
  seo.description = 'This page could not be found on ' + SITE_NAME + '.'
  seo.body = shell('<h1>Page not found</h1><p>We could not find that page.</p>' + list([link('/festivals', 'Browse film festivals'), link('/films', 'Browse films'), link('/', 'Festaview home')]))
  return seo
}

// ---------------------------------------------------------------- one page
export function pageSeo(pathname, data, origin) {
  void origin
  const seo = baseSeo(pathname)
  const route = matchRoute(pathname)
  if (!route) return notFound(seo)

  const festById = (id) => data.festivals.find((f) => f.id === id)
  const liveEvents = (data.events || []).filter((e) => !eventState(e).ended)

  switch (route.name) {
    case 'home': {
      seo.title = 'Festaview | Watch Film Festivals Online'
      seo.description = SITE_DESCRIPTION
      seo.jsonld.push(
        { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: SITE_URL + '/', logo: LOGO, description: SITE_DESCRIPTION },
        { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: SITE_URL + '/', description: SITE_DESCRIPTION },
      )
      seo.body = shell(
        '<h1>' + esc(SITE_TAGLINE) + '</h1><p>' + esc(SITE_DESCRIPTION) + '</p>' +
        (data.festivals.length ? '<h2>Film festivals</h2>' + list(data.festivals.slice(0, 12).map((f) => festivalLink(f) + (f.tagline ? ' - ' + esc(f.tagline) : ''))) : '') +
        (liveEvents.length ? '<h2>Virtual cinema</h2>' + list(liveEvents.slice(0, 6).map((e) => eventLine(e, festById(e.festival_id)))) : '') +
        (data.films.length ? '<h2>Just added</h2>' + list(data.films.slice(0, 12).map((m) => filmLine(m, festById(m.festival_id)))) : '') +
        '<h2>Explore</h2>' + list(STATIC_PAGES.filter(([h]) => h !== '/').map(([h, t]) => link(h, t))),
      )
      return seo
    }
    case 'festivals': {
      seo.title = 'Film Festivals to Watch Online'
      seo.description = 'Browse film festivals streaming on ' + SITE_NAME + '. Watch official selections, virtual screenings and festival TV channels from festivals around the world.'
      const items = [['/', 'Home'], [null, 'Film festivals']]
      seo.jsonld.push(breadcrumbLd(items), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Film festivals', url: seo.canonical, mainEntity: { '@type': 'ItemList', itemListElement: data.festivals.map((f, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(festivalPath(f)), name: f.name })) } })
      seo.body = shell(crumbs(items) + '<h1>Film festivals</h1><p>Every festival on ' + esc(SITE_NAME) + ' has its own page, film guide, schedule and channel.</p>' + list(data.festivals.map((f) => festivalLink(f) + (f.tagline ? ' - ' + esc(f.tagline) : ''))))
      return seo
    }
    case 'festival': {
      const f = data.festivals.find((x) => x.slug === route.slug)
      if (!f) return data.ok ? notFound(seo) : seo
      const films = data.films.filter((m) => m.festival_id === f.id)
      const events = liveEvents.filter((e) => e.festival_id === f.id)
      const venues = data.venues.filter((v) => v.festival_id === f.id)
      const chan = buildChannels(data).find((c) => c.festivalId === f.id)
      seo.canonical = abs(festivalPath(f))
      seo.title = f.name + ': Watch the Festival Online'
      seo.description = clip((f.tagline ? f.tagline + '. ' : '') + 'Watch ' + f.name + ' online: ' + (films.length ? films.length + (films.length === 1 ? ' film' : ' films') + ', ' : '') + 'virtual screenings and live events on ' + SITE_NAME + '.' + (f.starts_on ? ' ' + f.starts_on + (f.ends_on && f.ends_on !== f.starts_on ? ' to ' + f.ends_on : '') + '.' : ''), 158)
      seo.image = f.banner_url || (films[0] && films[0].poster_url) || f.logo_url || DEFAULT_IMAGE
      const items = [['/', 'Home'], ['/festivals', 'Film festivals'], [null, f.name]]
      const ld = { '@context': 'https://schema.org', '@type': 'Festival', name: f.name, url: seo.canonical, description: clip(f.description || f.tagline || SITE_DESCRIPTION, 300), image: f.banner_url || f.logo_url || undefined, organizer: { '@type': 'Organization', name: f.name, url: f.website || undefined } }
      if (f.starts_on) { ld.startDate = f.starts_on; ld.endDate = f.ends_on || f.starts_on }
      ld.location = f.location ? { '@type': 'Place', name: f.location, address: f.location } : { '@type': 'VirtualLocation', url: seo.canonical }
      if (f.starts_on) { ld.eventStatus = 'https://schema.org/EventScheduled'; ld.eventAttendanceMode = venues.length ? 'https://schema.org/MixedEventAttendanceMode' : 'https://schema.org/OnlineEventAttendanceMode' }
      seo.jsonld.push(breadcrumbLd(items), ld)
      seo.body = shell(
        crumbs(items) + '<h1>' + esc(f.name) + '</h1>' + (f.tagline ? '<p>' + esc(f.tagline) + '</p>' : '') +
        '<p>' + esc(f.description || f.name + ' celebrates independent film. Browse the Official Selection, catch live events and find a screening near you.') + '</p>' +
        '<dl>' + (f.starts_on ? '<dt>When</dt><dd>' + esc(f.starts_on) + (f.ends_on && f.ends_on !== f.starts_on ? ' to ' + esc(f.ends_on) : '') + '</dd>' : '') + (f.location ? '<dt>Where</dt><dd>' + esc(f.location) + '</dd>' : '') + '<dt>Films</dt><dd>' + films.length + '</dd></dl>' +
        (films.length ? '<h2>Official Selection</h2>' + list(films.map((m) => filmLine(m, null))) : '<p>This festival\'s films are coming soon.</p>') +
        (events.length ? '<h2>Virtual cinema</h2>' + list(events.map((e) => eventLine(e, null))) : '') +
        (chan ? '<h2>' + esc(f.name) + ' Channel</h2><p>' + link(channelPath(chan), chan.name) + ' plays the festival films on a schedule.</p>' : '') +
        (venues.length ? '<h2>Theaters</h2>' + list(venues.map((v) => esc(v.name) + (v.city ? ', ' + esc(v.city) : ''))) : ''),
      )
      return seo
    }
    case 'films': {
      seo.title = 'Watch Independent Films Online'
      seo.description = 'Stream independent films from film festivals around the world. Shorts, features and documentaries, most of them free to watch on ' + SITE_NAME + '.'
      const items = [['/', 'Home'], [null, 'Films']]
      seo.jsonld.push(breadcrumbLd(items), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Independent films', url: seo.canonical, mainEntity: { '@type': 'ItemList', itemListElement: data.films.slice(0, 100).map((m, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(filmPath(m)), name: m.title })) } })
      seo.body = shell(crumbs(items) + '<h1>Watch independent films</h1><p>Official selections from film festivals, from shorts to features. Most are free to watch.</p>' + list(data.films.map((m) => filmLine(m, festById(m.festival_id)))))
      return seo
    }
    case 'film': {
      const m = data.films.find((x) => x.id === route.id)
      if (!m) return data.ok ? notFound(seo) : seo
      const f = festById(m.festival_id)
      const more = data.films.filter((x) => x.festival_id === m.festival_id && x.id !== m.id).slice(0, 6)
      seo.canonical = abs(filmPath(m))
      seo.title = m.title + (m.year ? ' (' + m.year + ')' : '') + (f ? ' | ' + f.name : '')
      seo.description = clip((m.synopsis || 'Watch ' + m.title + ' online') + (f ? ' An official selection of ' + f.name + '.' : ''), 158)
      seo.image = m.poster_url || (f && (f.banner_url || f.logo_url)) || DEFAULT_IMAGE
      seo.ogType = 'video.movie'
      const items = [['/', 'Home'], ['/films', 'Films'], ...(f ? [[festivalPath(f), f.name]] : []), [null, m.title]]
      const free = m.access !== 'ticketed'
      const movie = {
        '@context': 'https://schema.org', '@type': 'Movie', name: m.title, url: seo.canonical, description: clip(m.synopsis || '', 500) || undefined, image: m.poster_url || undefined,
        director: m.director ? { '@type': 'Person', name: m.director } : undefined, duration: isoDuration(m.runtime_min), genre: m.genre || undefined,
        dateCreated: m.year ? String(m.year) : undefined, countryOfOrigin: m.country || undefined, inLanguage: m.language || undefined,
        isAccessibleForFree: free, isPartOf: f ? { '@type': 'Festival', name: f.name, url: abs(festivalPath(f)) } : undefined,
        potentialAction: { '@type': 'WatchAction', target: seo.canonical },
      }
      seo.jsonld.push(breadcrumbLd(items), movie)
      const upload = (m.created_at || '').slice(0, 10) || undefined
      if (free && m.video_url) seo.jsonld.push({ '@context': 'https://schema.org', '@type': 'VideoObject', name: m.title, description: clip(m.synopsis || m.title, 300), thumbnailUrl: m.poster_url || DEFAULT_IMAGE, uploadDate: upload, duration: isoDuration(m.runtime_min), contentUrl: m.video_url })
      if (m.trailer_url) seo.jsonld.push({ '@context': 'https://schema.org', '@type': 'VideoObject', name: m.title + ' trailer', description: 'Trailer for ' + m.title, thumbnailUrl: m.poster_url || DEFAULT_IMAGE, uploadDate: upload, contentUrl: m.trailer_url })
      seo.body = shell(
        crumbs(items) + '<h1>' + esc(m.title) + '</h1>' +
        '<p>' + [m.year, m.runtime_min ? m.runtime_min + ' min' : null, m.genre, m.rating, m.country, m.language].filter(Boolean).map(esc).join(' | ') + '</p>' +
        (m.director ? '<p>Directed by ' + esc(m.director) + '</p>' : '') + (f ? '<p>Official Selection, ' + festivalLink(f) + '</p>' : '') +
        '<p>' + esc(m.synopsis || 'Synopsis coming soon.') + '</p><p>' + (free ? 'Free to watch on ' + esc(SITE_NAME) + '.' : 'A ticketed screening: an access code or ticket is required.') + '</p>' +
        (more.length ? '<h2>More from ' + esc(f ? f.name : 'this festival') + '</h2>' + list(more.map((x) => filmLine(x, null))) : ''),
      )
      return seo
    }
    case 'cinema': {
      seo.title = 'Virtual Theater: Now Showing and Showtimes'
      seo.description = 'The Festaview virtual theater. See what is playing on every screen and the showtimes, then watch together with everyone, from anywhere.'
      const items = [['/', 'Home'], [null, 'Virtual theater']]
      const shows = (data.cinema || []).slice().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      seo.jsonld.push(breadcrumbLd(items), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Virtual theater', url: seo.canonical, mainEntity: { '@type': 'ItemList', itemListElement: shows.slice(0, 50).map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(cinemaPath(s)), name: s.title })) } })
      seo.body = shell(crumbs(items) + '<h1>Virtual theater</h1><p>Scheduled showings on numbered screens. Everyone watches together, and you can join late. Times appear in your own time zone.</p>' +
        (shows.length ? '<h2>Now showing and coming up</h2>' + list(shows.map((s) => link(cinemaPath(s), s.title) + ' - ' + esc(s.screen_name) + ' - ' + esc(new Date(s.starts_at).toISOString()) + (s.festival_name ? ' - ' + esc(s.festival_name) : ''))) : '<p>No showings are scheduled right now. Check back soon.</p>'))
      return seo
    }
    case 'showing': {
      const s = (data.cinema || []).find((x) => x.id === route.id)
      if (!s) return data.ok ? notFound(seo) : seo
      seo.canonical = abs(cinemaPath(s))
      seo.title = s.title + ': Virtual Theater Showing'
      seo.description = clip((s.description || 'Watch ' + s.title + ' in the Festaview virtual theater.') + ' ' + s.screen_name + (s.festival_name ? ', presented by ' + s.festival_name : '') + '.', 158)
      seo.image = s.poster_url || DEFAULT_IMAGE
      const items = [['/', 'Home'], ['/cinema', 'Virtual theater'], [null, s.title]]
      const ld = {
        '@context': 'https://schema.org', '@type': 'ScreeningEvent', name: s.title, description: clip(s.description || s.title, 500), url: seo.canonical, image: s.poster_url || undefined,
        startDate: new Date(s.starts_at).toISOString(), endDate: new Date(s.ends_at).toISOString(),
        eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        location: { '@type': 'VirtualLocation', url: seo.canonical, name: s.screen_name },
        organizer: s.festival_name ? { '@type': 'Organization', name: s.festival_name, url: s.festival_slug ? abs('/festival/' + s.festival_slug) : undefined } : undefined,
        isAccessibleForFree: s.access !== 'ticketed',
        offers: { '@type': 'Offer', url: seo.canonical, price: '0', priceCurrency: 'USD', availability: s.seats != null && s.taken >= s.seats ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock' },
        workPresented: s.kind === 'live' ? undefined : { '@type': 'Movie', name: s.title },
      }
      seo.jsonld.push(breadcrumbLd(items), ld)
      seo.body = shell(crumbs(items) + '<h1>' + esc(s.title) + '</h1><p>' + esc(s.screen_name) + (s.festival_name ? ' | ' + esc(s.festival_name) : '') + '</p><p>' + esc(s.description || '') + '</p>' +
        '<p>Showtime: ' + esc(new Date(s.starts_at).toISOString()) + ' (shown in your own time zone in the page). Runtime ' + s.runtime_min + ' minutes. ' + (s.access === 'ticketed' ? 'Ticketed.' : 'Free.') + (s.seats != null ? ' ' + Math.max(0, s.seats - s.taken) + ' seats left.' : '') + '</p>')
      return seo
    }
    case 'virtualList': {
      seo.title = 'Virtual Cinema: Online Screenings and Live Events'
      seo.description = 'Watch film festival screenings, programs and live events online. Virtual cinema on ' + SITE_NAME + ' with watch windows, live Q&As and chat.'
      const items = [['/', 'Home'], [null, 'Virtual cinema']]
      seo.jsonld.push(breadcrumbLd(items), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Virtual cinema', url: seo.canonical, mainEntity: { '@type': 'ItemList', itemListElement: liveEvents.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(eventPath(e)), name: e.title })) } })
      seo.body = shell(crumbs(items) + '<h1>Virtual cinema</h1><p>Film festival screenings, programs and live events you can watch from home.</p>' +
        (liveEvents.length ? list(liveEvents.map((e) => eventLine(e, festById(e.festival_id)))) : '<p>No virtual events are scheduled right now. Festivals add online screenings, programs and live events here.</p>') +
        '<h2>How virtual cinema works</h2>' + list(['Screenings and programs: watch one film, or a program of several films played in order.', 'Live events: join a live stream with chat and a question box for the filmmakers.', 'Watch windows: each screening opens at a set time, and once you press play you have a set number of hours to finish.', 'Free or ticketed: many screenings are free; ticketed events use an access code from the festival.']))
      return seo
    }
    case 'event': {
      const e = (data.events || []).find((x) => x.id === route.id)
      if (!e) return data.ok ? notFound(seo) : seo
      const f = festById(e.festival_id)
      seo.canonical = abs(eventPath(e))
      seo.title = e.title + (f ? ' | ' + f.name : '')
      seo.description = clip((e.description || 'Watch ' + e.title + ' online') + (f ? ' A virtual event from ' + f.name + '.' : ''), 158)
      seo.image = e.poster_url || (f && (f.banner_url || f.logo_url)) || DEFAULT_IMAGE
      const items = [['/', 'Home'], ['/virtual', 'Virtual cinema'], [null, e.title]]
      const prices = (data.products || []).filter((p) => p.festival_id === e.festival_id && (p.event_id === e.id || (!p.film_id && !p.event_id))).map((p) => p.price_cents)
      const start = e.starts_at || e.available_from
      const ld = {
        '@context': 'https://schema.org', '@type': 'Event', name: e.title, description: clip(e.description || e.title, 500), url: seo.canonical, image: e.poster_url || undefined,
        eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
        location: { '@type': 'VirtualLocation', url: seo.canonical }, organizer: f ? { '@type': 'Organization', name: f.name, url: abs(festivalPath(f)) } : undefined,
        offers: { '@type': 'Offer', url: seo.canonical, price: e.access === 'ticketed' && prices.length ? (Math.min(...prices) / 100).toFixed(2) : '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
      }
      if (start) ld.startDate = new Date(start).toISOString()
      if (e.available_until) ld.endDate = new Date(e.available_until).toISOString()
      seo.jsonld.push(breadcrumbLd(items), ld)
      seo.body = shell(crumbs(items) + '<h1>' + esc(e.title) + '</h1>' + (f ? '<p>' + festivalLink(f) + '</p>' : '') + '<p>' + esc(e.description || '') + '</p>' +
        '<p>' + esc(eventState(e).label) + ' | ' + (e.access === 'ticketed' ? 'Ticketed' : 'Free') + (e.watch_hours ? ' | ' + e.watch_hours + ' hours to finish once you press play' : '') + (e.capacity ? ' | Limited to ' + e.capacity + ' viewers' : '') + '</p>')
      return seo
    }
    case 'tvGuide': {
      const chans = buildChannels(data)
      seo.title = 'TV Guide: Film Festival Channels'
      seo.description = 'See what is playing on every film festival channel. ' + SITE_NAME + ' channels play festival films on a schedule, so everyone watches together.'
      const items = [['/', 'Home'], [null, 'TV guide']]
      seo.jsonld.push(breadcrumbLd(items), { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'TV guide', url: seo.canonical, mainEntity: { '@type': 'ItemList', itemListElement: chans.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(channelPath(c)), name: c.name })) } })
      seo.body = shell(crumbs(items) + '<h1>TV guide</h1><p>Festival channels play on a schedule. Tune in and you join whatever is on right now.</p>' + (chans.length ? list(chans.map((c) => 'Channel ' + c.number + ': ' + link(channelPath(c), c.name) + ' (' + c.items.length + (c.items.length === 1 ? ' film' : ' films') + ')')) : '<p>No channels are on right now.</p>'))
      return seo
    }
    case 'channel': {
      const c = buildChannels(data).find((x) => x.slug === route.slug)
      if (!c) return data.ok ? notFound(seo) : seo
      seo.canonical = abs(channelPath(c))
      seo.title = c.name + ': Now Playing'
      seo.description = 'Watch ' + c.name + ' on ' + SITE_NAME + '. A scheduled channel of festival films, so everyone sees the same film at the same time.'
      const items = [['/', 'Home'], ['/tv-guide', 'TV guide'], [null, c.name]]
      seo.jsonld.push(breadcrumbLd(items), { '@context': 'https://schema.org', '@type': 'BroadcastService', name: c.name, url: seo.canonical, description: seo.description, broadcastDisplayName: c.name, provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL + '/' } })
      seo.body = shell(crumbs(items) + '<h1>' + esc(c.name) + '</h1><p>' + esc(seo.description) + '</p><h2>Films on this channel</h2>' + list(c.items.map((i) => link(filmPath(i.film), i.title) + ', ' + Math.round(i.duration / 60) + ' min')))
      return seo
    }
    case 'liveList': {
      const feeds = data.feeds.filter((f) => f.is_live || f.is_replay_loop)
      seo.title = 'Live and Always-On Festival Channels'
      seo.description = 'Live premieres, Q&As and 24/7 replay channels from film festivals, streaming on ' + SITE_NAME + '.'
      const items = [['/', 'Home'], [null, 'Live channels']]
      seo.jsonld.push(breadcrumbLd(items))
      seo.body = shell(crumbs(items) + '<h1>Live and always-on channels</h1><p>Live premieres, Q&amp;As and replay channels from film festivals.</p>' + (feeds.length ? list(feeds.map((l) => link(liveFeedPath(l), l.name) + (festById(l.festival_id) ? ' - ' + esc(festById(l.festival_id).name) : ''))) : '<p>Live premieres and 24/7 festival channels will appear here.</p>'))
      return seo
    }
    case 'liveFeed': {
      const l = data.feeds.find((x) => x.id === route.id)
      if (!l) return data.ok ? notFound(seo) : seo
      const f = festById(l.festival_id)
      seo.canonical = abs(liveFeedPath(l))
      seo.title = l.name
      seo.description = (l.is_live ? 'Watch ' : 'Watch the replay channel ') + l.name + (f ? ' from ' + f.name : '') + ' on ' + SITE_NAME + '.'
      const items = [['/', 'Home'], ['/live', 'Live channels'], [null, l.name]]
      seo.jsonld.push(breadcrumbLd(items))
      seo.body = shell(crumbs(items) + '<h1>' + esc(l.name) + '</h1><p>' + esc(seo.description) + '</p>')
      return seo
    }
    case 'watch': {
      seo.title = 'How to Watch: Roku and Web'
      seo.description = 'Watch ' + SITE_NAME + ' on the web or on Roku. Free, ad-supported film festival streaming with live premieres, virtual screenings and festival channels.'
      const items = [['/', 'Home'], [null, 'Watch']]
      seo.jsonld.push(breadcrumbLd(items))
      seo.body = shell(crumbs(items) + '<h1>Watch on the biggest screen</h1><p>' + esc(SITE_NAME) + ' is built for the living room. Open the Roku channel and browse every festival, jump into a live premiere, or pick up a short before dinner. You can also watch on any web browser.</p>' + list(['Free and ad-supported, no subscription (some festivals add ticketed events)', 'Live premieres, Q&amp;As and 24/7 replay channels', 'Captions on films, so everyone can watch']))
      return seo
    }
    case 'forFestivals': {
      seo.title = 'For Film Festivals: Stream Your Festival Year-Round'
      seo.description = 'Give your film festival its own channel, page, virtual screenings and live events on ' + SITE_NAME + '. Festivals receive 80% of the ad revenue their content earns.'
      const items = [['/', 'Home'], [null, 'For film festivals']]
      seo.jsonld.push(breadcrumbLd(items), { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) })
      seo.body = shell(crumbs(items) + '<h1>Run a film festival?</h1><p>Your festival runs for a week. Your audience should be there all year. Create a free festival account and your festival is set up in minutes.</p>' +
        '<h2>What you get</h2>' + list(BENEFITS.map(([t, d]) => '<strong>' + esc(t) + '.</strong> ' + esc(d))) + '<p>' + link('/admin?signup=1', 'Create your festival') + '</p>' +
        '<h2>Questions</h2>' + FAQ.map(([q, a]) => '<h3>' + esc(q) + '</h3><p>' + esc(a) + '</p>').join(''))
      return seo
    }
    case 'submitIndex': {
      seo.title = 'Submit Your Film to Festivals'
      seo.description = 'Create one filmmaker account, find film festivals accepting submissions, enter your short or feature, and pay the entry fee by card on ' + SITE_NAME + '.'
      const open = data.festivals.map((f) => ({ f, cats: festivalCategories(data.submissionCategories, data.submissionTiers, f.id) })).filter((x) => submissionState(x.f) === 'open' && x.cats.length)
      const items = [['/', 'Home'], [null, 'Submit your film']]
      seo.jsonld.push(breadcrumbLd(items))
      seo.body = shell(crumbs(items) + '<h1>Submit your film</h1><p>One ' + esc(SITE_NAME) + ' account lets you enter any festival on the platform, pay entry fees by card and track every submission.</p>' +
        (open.length ? '<h2>Festivals accepting submissions</h2>' + list(open.map((x) => link(submitPath(x.f), x.f.name) + (x.f.submissions_closes_at ? ' - final deadline ' + esc(fmtDate(x.f.submissions_closes_at)) : ''))) : '<p>No festival is accepting submissions right now. Check back soon.</p>'))
      return seo
    }
    case 'festivalSubmit': {
      const f = data.festivals.find((x) => x.slug === route.slug)
      if (!f) return data.ok ? notFound(seo) : seo
      const cats = festivalCategories(data.submissionCategories, data.submissionTiers, f.id)
      const state = submissionState(f)
      seo.canonical = abs(submitPath(f))
      seo.title = 'Submit to ' + f.name
      seo.description = clip('Submit your film to ' + f.name + '. ' + (cats.length ? 'Categories: ' + cats.map((c) => c.name).join(', ') + '. ' : '') + 'See fees and deadlines, then enter and pay online.', 158)
      if (state !== 'open') seo.robots = 'noindex,follow'
      const items = [['/', 'Home'], ['/submit', 'Submit your film'], [festivalPath(f), f.name], [null, 'Submit']]
      seo.jsonld.push(breadcrumbLd(items))
      seo.body = shell(crumbs(items) + '<h1>Submit to ' + esc(f.name) + '</h1>' + (f.submission_notes ? '<p>' + esc(f.submission_notes) + '</p>' : '') +
        (state === 'open' ? '' : '<p>This festival is not accepting submissions right now.</p>') +
        cats.map((c) => '<h2>' + esc(c.name) + '</h2>' + (c.description ? '<p>' + esc(c.description) + '</p>' : '') + list(c.tiers.map((t) => esc(t.name) + ': ' + esc(feeMoney(t.fee_cents)) + (t.deadline ? ' until ' + esc(fmtDate(t.deadline)) : '')))).join('') +
        (f.submissions_closes_at ? '<p>Final deadline ' + esc(fmtDate(f.submissions_closes_at)) + '.</p>' : ''))
      return seo
    }
    case 'about': {
      seo.title = 'About Festaview'
      seo.description = SITE_DESCRIPTION
      const items = [['/', 'Home'], [null, 'About']]
      seo.jsonld.push(breadcrumbLd(items), { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'About ' + SITE_NAME, url: seo.canonical, description: SITE_DESCRIPTION })
      seo.body = shell(crumbs(items) + '<h1>About ' + esc(SITE_NAME) + '</h1><p>' + esc(SITE_DESCRIPTION) + '</p>' + list(['Watch official selections from film festivals, on demand.', 'Join live premieres, virtual screenings and Q&amp;As.', 'Tune in to festival channels that play on a schedule.', 'Watch on Roku or any web browser.']))
      return seo
    }
    default: // admin, network, access, theater, filmmaker: private, never indexed
      seo.title = 'Festaview'
      seo.robots = 'noindex,nofollow'
      seo.canonical = SITE_URL + '/'
      seo.body = ''
      return seo
  }
}

// ---------------------------------------------------------------- put the SEO into the page HTML
export function injectSeo(html, seo) {
  const t = fullTitle(seo.title)
  const head = [
    '<title>' + esc(t) + '</title>',
    '<meta name="description" content="' + esc(seo.description) + '">',
    '<meta name="robots" content="' + esc(seo.robots) + '">',
    '<link rel="canonical" href="' + esc(seo.canonical) + '">',
    '<meta property="og:site_name" content="' + esc(SITE_NAME) + '">',
    '<meta property="og:type" content="' + esc(seo.ogType) + '">',
    '<meta property="og:title" content="' + esc(t) + '">',
    '<meta property="og:description" content="' + esc(seo.description) + '">',
    '<meta property="og:url" content="' + esc(seo.canonical) + '">',
    '<meta property="og:image" content="' + esc(seo.image) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(t) + '">',
    '<meta name="twitter:description" content="' + esc(seo.description) + '">',
    '<meta name="twitter:image" content="' + esc(seo.image) + '">',
    ...seo.jsonld.map((j) => '<script type="application/ld+json">' + JSON.stringify(j).replace(/</g, '\\u003c') + '</script>'),
  ].join('\n    ')
  let out = html
    .replace(/<meta (?:property|name)="(?:og|twitter):[^>]*>\s*/gi, '')
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta name="description"[^>]*>\s*/i, '')
    .replace(/<meta name="robots"[^>]*>\s*/i, '')
    .replace(/<link rel="canonical"[^>]*>\s*/i, '')
  out = out.replace('</head>', '    ' + head + '\n  </head>')
  if (seo.body) out = out.replace('<div id="root"></div>', '<div id="root">' + seo.body + '</div>')
  return out
}

// ---------------------------------------------------------------- sitemap and llms.txt
export function sitemapXml(data) {
  const urls = [
    ...STATIC_PAGES.map(([p]) => abs(p === '/' ? '/' : p)),
    ...data.festivals.map((f) => abs(festivalPath(f))),
    ...data.festivals.filter((f) => submissionState(f) === 'open' && festivalCategories(data.submissionCategories, data.submissionTiers, f.id).length).map((f) => abs(submitPath(f))),
    ...data.films.map((m) => abs(filmPath(m))),
    ...(data.events || []).filter((e) => !eventState(e).ended).map((e) => abs(eventPath(e))),
    ...(data.cinema || []).map((s) => abs(cinemaPath(s))),
    ...buildChannels(data).map((c) => abs(channelPath(c))),
    ...data.feeds.filter((l) => l.is_live || l.is_replay_loop).map((l) => abs(liveFeedPath(l))),
  ]
  const seen = [...new Set(urls)]
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + seen.map((u) => '  <url><loc>' + esc(u) + '</loc></url>').join('\n') + '\n</urlset>\n'
}

// llms.txt: a plain-text guide for AI assistants and answer engines.
export function llmsTxt(data) {
  const lines = [
    '# ' + SITE_NAME, '', '> ' + SITE_DESCRIPTION, '',
    SITE_NAME + ' is a streaming network for film festivals. Each festival has its own page, film guide, schedule, virtual screenings and TV channel. Viewers can watch on the web and on Roku. Most films are free and supported by ads; some festivals sell passes or tickets.', '',
    '## Main pages', '',
    ...STATIC_PAGES.filter(([p]) => p !== '/').map(([p, t]) => '- [' + t + '](' + abs(p) + ')'), '',
    '## Film festivals', '',
    ...(data.festivals.length ? data.festivals.map((f) => '- [' + f.name + '](' + abs(festivalPath(f)) + ')' + (f.tagline ? ': ' + f.tagline : '')) : ['- None published yet.']), '',
    '## Films', '',
    ...(data.films.length ? data.films.slice(0, 200).map((m) => '- [' + m.title + '](' + abs(filmPath(m)) + ')' + (m.synopsis ? ': ' + clip(m.synopsis, 140) : '')) : ['- None published yet.']), '',
    '## Contact', '', 'See ' + abs('/about') + '.', '',
  ]
  return lines.join('\n')
}
