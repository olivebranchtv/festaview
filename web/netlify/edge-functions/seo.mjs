import { loadCatalog, pageSeo, injectSeo } from '../lib/seo.mjs'

// Gives every page its own <title>, description, canonical link, social tags, structured data (JSON-LD) and crawlable
// HTML content in the response itself, so Google, Bing and AI search crawlers see the real page without running JavaScript.
// The website then takes over in the browser. Unknown festival, film and event addresses return a real 404.
let cache = { at: 0, data: null }

async function catalog() {
  if (cache.data && Date.now() - cache.at < 60000) return cache.data
  const url = (typeof Netlify !== 'undefined' && Netlify.env.get('VITE_SUPABASE_URL')) || undefined
  const key = (typeof Netlify !== 'undefined' && Netlify.env.get('VITE_SUPABASE_ANON_KEY')) || undefined
  const data = await loadCatalog(fetch, url && key ? { url, key } : undefined)
  if (data.ok) cache = { at: Date.now(), data }
  return data
}

export default async (request, context) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return context.next()
  const res = await context.next()
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res
  const url = new URL(request.url)
  const data = await catalog()
  const seo = pageSeo(url.pathname, data, url.origin)
  const html = injectSeo(await res.text(), seo)
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=0, s-maxage=300, must-revalidate',
  }
  if (seo.robots.includes('noindex')) headers['x-robots-tag'] = seo.robots
  return new Response(html, { status: seo.status, headers })
}

export const config = {
  path: '/*',
  excludedPath: ['/assets/*', '/favicon*', '/robots.txt', '/sitemap.xml', '/llms.txt', '/og-default.png', '/logo-*', '/apple-touch-icon*', '/.netlify/*'],
}
