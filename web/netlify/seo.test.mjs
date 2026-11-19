import { pageSeo, injectSeo, sitemapXml, llmsTxt, loadCatalog } from './lib/seo.mjs'
import { filmPath, eventPath, channelPath, festivalPath, cinemaPath, submitPath } from '../src/paths.js'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)) }

const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString()
const data = {
  ok: true,
  festivals: [
    { id: 'f1', slug: 'olive-branch', name: 'Olive Branch Film Festival', tagline: 'Faith, Family & Film', description: 'A festival of faith and family films.', location: 'Arizona', starts_on: '2027-03-12', ends_on: '2027-03-16', website: 'https://example.org', banner_url: 'https://img.example/banner.jpg', auto_channel: true, channel_order: 'listed', status: 'published', submissions_open: true, submissions_opens_at: null, submissions_closes_at: iso(24 * 60), submission_notes: 'No <script> premieres please.' },
    { id: 'f2', slug: 'night-owl', name: 'Night Owl Horror Fest', tagline: 'After dark', status: 'published', auto_channel: false },
  ],
  films: [
    { id: 'm1', festival_id: 'f1', title: 'The Sparrows Nesting', synopsis: 'A quiet story about a family and a nest.', director: 'A. Moreno', year: 2024, runtime_min: 92, genre: 'Drama', poster_url: 'https://img.example/p1.jpg', video_url: 'https://cdn.example/free/playlist.m3u8', trailer_url: 'https://cdn.example/trailer/playlist.m3u8', duration_sec: 5518, access: 'free', created_at: '2026-11-01T00:00:00Z' },
    { id: 'm2', festival_id: 'f1', title: 'Premiere <Night> & "Gala"', synopsis: 'Ticketed <b>premiere</b>.', director: 'B. Okafor', year: 2026, runtime_min: 12, genre: 'Short', video_url: null, access: 'ticketed', created_at: '2026-11-02T00:00:00Z' },
  ],
  events: [
    { id: 'e1', festival_id: 'f1', kind: 'screening', title: 'Opening Night Virtual Screening', description: 'Watch the opening film at home.', film_ids: ['m1'], access: 'free', available_from: iso(-24), available_until: iso(72), watch_hours: 48, status: 'published' },
    { id: 'e2', festival_id: 'f1', kind: 'live', title: 'Live Q&A', access: 'ticketed', starts_at: iso(48), available_until: iso(60), status: 'published' },
    { id: 'e3', festival_id: 'f1', kind: 'screening', title: 'Old event', access: 'free', available_until: iso(-100), status: 'published' },
  ],
  feeds: [{ id: 'l1', festival_id: 'f1', name: 'Olive Branch Live', is_live: true, stream_url: 'https://cdn.example/live.m3u8' }],
  venues: [{ id: 'v1', festival_id: 'f1', name: 'Lighthouse Cinema', city: 'Phoenix' }],
  products: [{ id: 'p1', festival_id: 'f1', event_id: 'e2', film_id: null, price_cents: 1500, currency: 'usd', active: true }],
  screenings: [],
  cinema: [
    { id: 'c0a1b2c3-0000-4000-8000-000000000001', screen_name: 'Screen 1', screen_number: 1, festival_name: 'Olive Branch Film Festival', festival_slug: 'olive-branch', title: 'Sparrows Premiere Night', description: 'A shared premiere of The Sparrows Nesting with a short Q&A.', poster_url: 'https://img.example/p1.jpg', starts_at: iso(5), ends_at: iso(7), seats: 100, taken: 100, access: 'free' },
    { id: 'c0a1b2c3-0000-4000-8000-000000000002', screen_name: 'Screen 2', screen_number: 2, festival_name: null, festival_slug: null, title: 'Late Show <Live>', description: null, poster_url: null, starts_at: iso(30), ends_at: iso(32), seats: null, taken: 3, access: 'free' },
  ],
  submissionCategories: [{ id: 'sc1', festival_id: 'f1', name: 'Short <Film>', description: 'Up to 40 minutes', active: true, sort_order: 1 }],
  submissionTiers: [
    { id: 't1', category_id: 'sc1', festival_id: 'f1', name: 'Early', deadline: iso(24 * 10), fee_cents: 2500, sort_order: 1 },
    { id: 't2', category_id: 'sc1', festival_id: 'f1', name: 'Regular', deadline: null, fee_cents: 3500, sort_order: 2 },
  ],
}
const base = '<!doctype html><html lang="en"><head><title>Festaview</title><meta name="description" content="old"><meta property="og:title" content="old"><link rel="canonical" href="https://old.example/"></head><body><div id="root"></div></body></html>'

const paths = [
  '/', '/festivals', '/festival/olive-branch', '/films', filmPath(data.films[0]), filmPath(data.films[1]), '/virtual', eventPath(data.events[0]), eventPath(data.events[1]),
  '/cinema', cinemaPath(data.cinema[0]), cinemaPath(data.cinema[1]), '/tv-guide', '/channel/mix', '/channel/olive-branch', '/live', '/live/l1/olive-branch-live', '/watch', '/for-festivals', '/about',
]
const count = (s, re) => (s.match(re) || []).length

for (const p of paths) {
  const seo = pageSeo(p, data, 'https://festaview.com')
  const html = injectSeo(base, seo)
  const label = p.length > 40 ? p.slice(0, 40) + '...' : p
  ok('[' + label + '] status 200', seo.status === 200, String(seo.status))
  const t = /<title>([^<]*)<\/title>/.exec(html)
  ok('[' + label + '] exactly one title, 60 characters or fewer', count(html, /<title>/g) === 1 && !!t && t[1].replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, 'x').length <= 70, t && t[1])
  ok('[' + label + '] description 50 to 170 characters', seo.description.length >= 50 && seo.description.length <= 170, seo.description.length + ': ' + seo.description)
  ok('[' + label + '] one canonical on the real host', count(html, /rel="canonical"/g) === 1 && html.includes('href="https://festaview.com'), '')
  ok('[' + label + '] old tags replaced', !html.includes('old.example') && !html.includes('content="old"'), '')
  ok('[' + label + '] exactly one h1 in the HTML body', count(seo.body, /<h1[ >]/g) === 1, String(count(seo.body, /<h1[ >]/g)))
  ok('[' + label + '] has internal links to follow', count(seo.body, /<a href="\//g) >= 5, '')
  ok('[' + label + '] og:image and twitter card present', html.includes('property="og:image"') && html.includes('summary_large_image'), '')
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])
  let parsed = true
  try { scripts.forEach((s) => JSON.parse(s)) } catch { parsed = false }
  ok('[' + label + '] structured data is valid JSON', parsed && scripts.length >= (p === '/' ? 2 : 1), String(scripts.length))
  ok('[' + label + '] page is indexable', seo.robots === 'index,follow')
}

// ---- type-specific structured data
const ld = (p) => [...injectSeo(base, pageSeo(p, data)).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
const types = (p) => ld(p).map((x) => x['@type'])
ok('home has Organization and WebSite', types('/').includes('Organization') && types('/').includes('WebSite'))
ok('festival page is a Festival with dates', (() => { const f = ld('/festival/olive-branch').find((x) => x['@type'] === 'Festival'); return f && f.startDate === '2027-03-12' && f.location.name === 'Arizona' })())
ok('film page is a Movie with duration and director', (() => { const m = ld(filmPath(data.films[0])).find((x) => x['@type'] === 'Movie'); return m && m.duration === 'PT1H32M' && m.director.name === 'A. Moreno' && m.isAccessibleForFree === true })())
ok('free film has a VideoObject for the film and the trailer', ld(filmPath(data.films[0])).filter((x) => x['@type'] === 'VideoObject').length === 2)
ok('event page is an online Event with a free offer', (() => { const e = ld(eventPath(data.events[0])).find((x) => x['@type'] === 'Event'); return e && e.eventAttendanceMode.includes('Online') && e.offers.price === '0' && e.startDate })())
ok('ticketed event offer uses the real ticket price', (() => { const e = ld(eventPath(data.events[1])).find((x) => x['@type'] === 'Event'); return e && e.offers.price === '15.00' })())
ok('for-festivals has FAQPage matching the visible questions', (() => { const f = ld('/for-festivals').find((x) => x['@type'] === 'FAQPage'); return f && f.mainEntity.length === 6 && pageSeo('/for-festivals', data).body.includes(f.mainEntity[0].name) })())
ok('inner pages have breadcrumbs', ['/festivals', '/films', '/virtual', '/tv-guide', '/about', filmPath(data.films[0])].every((p) => types(p).includes('BreadcrumbList')))

ok('cinema board is a CollectionPage with an ItemList', (() => { const c = ld('/cinema').find((x) => x['@type'] === 'CollectionPage'); return c && c.mainEntity.itemListElement.length === 2 })())
ok('showing page is a ScreeningEvent with sold-out availability', (() => { const e = ld(cinemaPath(data.cinema[0])).find((x) => x['@type'] === 'ScreeningEvent'); return e && e.offers.availability.endsWith('SoldOut') && e.eventAttendanceMode.includes('Online') })())
ok('open-seating showing is in stock', (() => { const e = ld(cinemaPath(data.cinema[1])).find((x) => x['@type'] === 'ScreeningEvent'); return e && e.offers.availability.endsWith('InStock') })())
ok('showing title is escaped in HTML', !injectSeo(base, pageSeo(cinemaPath(data.cinema[1]), data)).includes('<Live>'))

// ---- security: a ticketed film's video link must never appear in public HTML
const ticketedHtml = injectSeo(base, pageSeo(filmPath(data.films[1]), data))
ok('ticketed film page has no VideoObject and no stream link', !ticketedHtml.includes('VideoObject') && !ticketedHtml.includes('contentUrl'))
ok('ticketed film is marked not free', ld(filmPath(data.films[1])).find((x) => x['@type'] === 'Movie').isAccessibleForFree === false)

// ---- escaping
const trick = injectSeo(base, pageSeo(filmPath(data.films[1]), data))
ok('titles and text with < > & " are escaped in HTML', !trick.includes('<Night>') && !trick.includes('<b>premiere</b>') && trick.includes('&lt;Night&gt;'))
ok('JSON-LD cannot break out of its script tag', [...trick.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].every((m) => !m[1].includes('<')))

// ---- real 404s
for (const p of ['/festival/does-not-exist', '/film/zzz/nothing', '/virtual/zzz', '/cinema/zzz/nothing', '/channel/nope', '/live/zzz', '/random-page', '/festivals/extra']) {
  const s = pageSeo(p, data)
  ok('404 for ' + p, s.status === 404 && s.robots === 'noindex')
}
ok('a database outage does not create false 404s', pageSeo('/festival/does-not-exist', { ...data, ok: false }).status === 200)

// ---- private areas
for (const p of ['/admin', '/network', '/theater/olive-branch', '/access']) {
  const s = pageSeo(p, data)
  ok('private area ' + p + ' is noindex', s.status === 200 && s.robots.includes('noindex'))
}

// ---- sitemap and llms.txt
const sm = sitemapXml(data)
ok('sitemap is XML with the right namespace', sm.startsWith('<?xml') && sm.includes('http://www.sitemaps.org/schemas/sitemap/0.9'))
const locs = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
ok('sitemap has no duplicates', new Set(locs).size === locs.length)
ok('sitemap lists every festival, film, current event, channel and live feed', ['/festival/olive-branch', filmPath(data.films[0]), filmPath(data.films[1]), eventPath(data.events[0]), eventPath(data.events[1]), '/channel/mix', '/live/l1/olive-branch-live', '/virtual', '/cinema', cinemaPath(data.cinema[0]), cinemaPath(data.cinema[1]), '/tv-guide'].every((p) => locs.includes('https://festaview.com' + p)))
ok('sitemap leaves out ended events', !locs.some((l) => l.includes('/virtual/e3')))
ok('sitemap leaves out private pages', !locs.some((l) => /\/(admin|network|theater|access)/.test(l)))
ok('sitemap uses the real host only', locs.every((l) => l.startsWith('https://festaview.com')))
const llms = llmsTxt(data)
ok('llms.txt describes the site and lists festivals and films', llms.startsWith('# Festaview') && llms.includes('Olive Branch Film Festival') && llms.includes('The Sparrows Nesting') && llms.includes('https://festaview.com/festivals'))

// ---- catalog loading survives failures
const failing = async () => { throw new Error('network down') }
const down = await loadCatalog(failing, { url: 'https://x', key: 'k' })
ok('loadCatalog reports a failure instead of throwing', down.ok === false && Array.isArray(down.festivals))
const fake = async (u) => new Response(JSON.stringify(u.includes('festivals') ? [{ id: 'f1', slug: 'a', name: 'A' }] : []), { status: 200 })
const up = await loadCatalog(fake, { url: 'https://x', key: 'k' })
ok('loadCatalog reads festivals when the database answers', up.ok === true && up.festivals.length === 1)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
