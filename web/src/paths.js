// URL rules shared by the website (browser) and the SEO server code, so both always agree on every address.
export const SITE_NAME = 'Festaview'
export const SITE_URL = 'https://festaview.com'

export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export const festivalPath = (f) => '/festival/' + f.slug
export const filmPath = (m) => '/film/' + m.id + '/' + (slugify(m.title) || 'film')
export const eventPath = (e) => '/virtual/' + e.id + '/' + (slugify(e.title) || 'event')
export const channelPath = (c) => '/channel/' + c.slug
export const liveFeedPath = (l) => '/live/' + l.id + '/' + (slugify(l.name) || 'channel')
export const submitPath = (f) => '/festival/' + f.slug + '/submit'
export const cinemaPath = (s) => '/cinema/' + s.id + '/' + (slugify(s.title) || 'showing')

// Public pages that are listed in menus and the sitemap.
export const STATIC_PAGES = [
  ['/', 'Home'],
  ['/festivals', 'Film festivals'],
  ['/films', 'Films'],
  ['/cinema', 'Festaview Cinemas'],
  ['/virtual', 'Virtual cinema'],
  ['/submit', 'Submit your film'],
  ['/tv-guide', 'TV guide'],
  ['/live', 'Live channels'],
  ['/watch', 'Watch on Roku and web'],
  ['/for-festivals', 'For film festivals'],
  ['/watch-on-tv', 'Watch on your TV'],
  ['/about', 'About Festaview'],
]

// Which page an address belongs to. Returns null for an address that is not a page (shows a real 404).
export function matchRoute(pathname) {
  const p = String(pathname || '/').split('?')[0].replace(/\/+$/, '') || '/'
  const seg = p.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x) } catch { return x } })
  if (seg.length === 0) return { name: 'home' }
  const [a, b, c] = seg
  switch (a) {
    case 'festivals': return seg.length === 1 ? { name: 'festivals' } : null
    case 'festival':
      if (seg.length === 2) return { name: 'festival', slug: b }
      return seg.length === 3 && c === 'submit' ? { name: 'festivalSubmit', slug: b } : null
    case 'submit': return seg.length === 1 ? { name: 'submitIndex' } : null
    case 'films': return seg.length === 1 ? { name: 'films' } : null
    case 'film': return seg.length === 2 || seg.length === 3 ? { name: 'film', id: b, slug: c } : null
    case 'virtual':
      if (seg.length === 1) return { name: 'virtualList' }
      return seg.length === 2 || seg.length === 3 ? { name: 'event', id: b, slug: c } : null
    case 'cinema':
      if (seg.length === 1) return { name: 'cinema' }
      return seg.length === 2 || seg.length === 3 ? { name: 'showing', id: b, slug: c } : null
    case 'tv-guide': return seg.length === 1 ? { name: 'tvGuide' } : null
    case 'channel': return seg.length === 2 ? { name: 'channel', slug: b } : null
    case 'live':
      if (seg.length === 1) return { name: 'liveList' }
      return seg.length === 2 || seg.length === 3 ? { name: 'liveFeed', id: b, slug: c } : null
    case 'watch': return seg.length === 1 ? { name: 'watch' } : null
    case 'for-festivals': return seg.length === 1 ? { name: 'forFestivals' } : null
    case 'watch-on-tv': return seg.length === 1 ? { name: 'watchOnTv' } : null
    case 'about': return seg.length === 1 ? { name: 'about' } : null
    case 'admin': case 'network': case 'access': case 'filmmaker': return { name: a, private: true }
    case 'theater': return { name: 'theater', slug: b, private: true }
    default: return null
  }
}
