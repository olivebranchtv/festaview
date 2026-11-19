// /sitemap.xml and /llms.txt, generated live from the database so new festivals, films and events appear automatically.
import { loadCatalog, sitemapXml, llmsTxt } from '../lib/seo.mjs'

export default async (req) => {
  // Netlify may show this function the original address (/llms.txt) or the rewritten one, so check both.
  const u = new URL(req.url)
  const which = u.searchParams.get('f') || (u.pathname.includes('llms') ? 'llms' : 'sitemap')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  const data = await loadCatalog(fetch, url && key ? { url, key } : undefined)
  const cache = 'public, max-age=0, s-maxage=600, must-revalidate'
  if (which === 'llms') return new Response(llmsTxt(data), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': cache } })
  return new Response(sitemapXml(data), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': cache } })
}
